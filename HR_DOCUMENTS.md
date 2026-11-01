# Company HR documents

This feature uses /api/v1/documents. Existing /api/documents onboarding routes remain separate. HR and admin can manage company documents; all authenticated users can list, preview PDFs, and download. Superadmin has read access but is not granted upload/delete permission by this task.

## Configure before live use

Create a private Supabase bucket named hr-documents. Set file_size_limit to 10485760 and allowed_mime_types to application/pdf and application/vnd.openxmlformats-officedocument.wordprocessingml.document. Do not grant public/anonymous read, write, update, or delete policies on the bucket. The bucket restrictions are required even though the API also validates metadata.

Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_BUCKET in backend/Vercel environment variables. Never expose the service role key to browsers or Git. The frontend uses only its public project URL and anon key. Restart after changing environment variables.

## Postman and frontend flow

Send Authorization: Bearer <login-token> to every API endpoint.

1. POST /api/v1/documents/upload-url with JSON { "originalName": "Handbook.pdf", "mimeType": "application/pdf", "size": 1024, "category": "policy" }. Use the real file size. Response: { path, token, url }.
2. Upload the actual bytes directly to Supabase. In the browser call supabase.storage.from('hr-documents').uploadToSignedUrl(path, token, file, { contentType: file.type }). In Postman PUT the file as a binary body to the returned url with its Content-Type header. Do not send file bytes to this API.
3. POST /api/v1/documents with JSON { "title": "Handbook", "category": "policy", "filePath": "<path from step 1>" }. The API verifies server-issued ownership and actual storage metadata, then returns 201.
4. GET /api/v1/documents or append ?category=policy. Returns all saved documents, newest first, without filePath.
5. GET /api/v1/documents/<id>/preview or /download. Response: { url, expiresIn: 60 }. Open the URL; download uses the original name. DOCX preview returns 400.
6. DELETE /api/v1/documents/<id> as HR/admin. Storage failure preserves the record.

Upload URLs use Supabase's default two hour validity. Server-issued upload receipts are retained for one day and must belong to the confirming user. Saved paths have a unique MongoDB index. Abandoned storage files are intentionally not cleaned up.

## Verification

Run npm run test:hr-documents for isolated validation/security/controller checks and npm test for existing unit coverage. Swagger includes all six operations under HR Documents. No lint/format scripts are configured in this repository.

Before release, use live credentials to verify direct oversized/wrong-type rejection, raw private URL denial, PDF/DOCX uploads, link expiration, and deletion. These checks require an actual configured Supabase project and MongoDB. Ensure production database indexes are built, including HrDocument.filePath and HrUpload.filePath unique indexes and HrUpload.expiresAt TTL index.

If storage deletion succeeds but the database delete fails, the API returns an error; retry deletion after database recovery. The two services cannot provide an atomic transaction.
