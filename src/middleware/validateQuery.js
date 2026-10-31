const ApiResponse = require('../utils/apiResponse');

/**
 * Validates req.query against a Zod schema. On success the parsed (and stripped)
 * query is stored on req.validatedQuery; on failure responds 400 with every
 * distinct issue message joined into one readable sentence.
 * Mount after protect/authorize so auth is always checked before input.
 * @param {import('zod').ZodType} schema
 */
const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);

  if (!result.success) {
    const message = [...new Set(result.error.issues.map((issue) => issue.message))].join('; ');
    return ApiResponse.error(res, message, null, 400);
  }

  req.validatedQuery = result.data;
  next();
};

module.exports = validateQuery;
