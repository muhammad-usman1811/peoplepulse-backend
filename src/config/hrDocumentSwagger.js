const pdf = 'application/pdf';
const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const metadata = { type: 'object', required: ['originalName', 'mimeType', 'size', 'category'], properties: {
  originalName: { type: 'string', example: 'Employee Handbook.pdf' },
  mimeType: { type: 'string', enum: [pdf, docx] },
  size: { type: 'integer', minimum: 1, maximum: 10485760, example: 1024 },
  category: { type: 'string', enum: ['policy', 'announcement', 'form'] },
} };
const confirmation = { type: 'object', required: ['title', 'category', 'filePath'], properties: {
  title: { type: 'string', example: 'Employee Handbook' }, category: metadata.properties.category,
  filePath: { type: 'string', description: 'The path returned by upload-url, issued to this user' },
} };
const signedLink = { type: 'object', properties: { url: { type: 'string' }, expiresIn: { type: 'integer', example: 60 } } };
const operation = (summary, schema, body, withId = false) => ({
  summary, tags: ['HR Documents'], security: [{ BearerAuth: [] }],
  ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
  ...(withId ? { parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] } : {}),
  responses: {
    [body === confirmation ? 201 : 200]: { description: 'Success', content: { 'application/json': { schema } } },
    400: { description: 'Invalid metadata/path, missing storage file, duplicate path, or DOCX preview' },
    401: { description: 'Login required' }, 403: { description: 'Role not permitted' },
    404: { description: 'Document not found' }, 500: { description: 'Storage or database failure' },
  },
});
module.exports = {
  '/v1/documents/upload-url': { post: operation('HR/Admin: issue a direct upload URL (no file bytes)', {
    type: 'object', properties: { path: { type: 'string' }, token: { type: 'string' }, url: { type: 'string' } },
  }, metadata) },
  '/v1/documents': {
    post: operation('HR/Admin: verify stored file and save metadata', { type: 'object' }, confirmation),
    get: { ...operation('List all company documents newest first; no storage paths', { type: 'array', items: { type: 'object' } }),
      parameters: [{ in: 'query', name: 'category', schema: metadata.properties.category }] },
  },
  '/v1/documents/{id}/preview': { get: operation('Get a 60 second PDF preview URL; DOCX returns 400', signedLink, null, true) },
  '/v1/documents/{id}/download': { get: operation('Get a 60 second download URL using the original filename', signedLink, null, true) },
  '/v1/documents/{id}': { delete: operation('HR/Admin: remove storage file before deleting record', { type: 'object' }, null, true) },
};
