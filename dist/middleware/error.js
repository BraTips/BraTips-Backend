"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
function notFound(req, res) { res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }); }
function errorHandler(err, _req, res, _next) {
    console.error(err);
    if (err instanceof zod_1.ZodError)
        return res.status(400).json({ message: "Validation failed", issues: err.issues });
    if (err?.code === 11000)
        return res.status(409).json({ message: "A record with the same unique value already exists" });
    const status = err?.statusCode ?? 500;
    res.status(status).json({ message: status === 500 ? "Internal server error" : err.message });
}
