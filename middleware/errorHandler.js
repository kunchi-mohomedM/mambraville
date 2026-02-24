const errorHandler = (err, req, res, next) => {
    console.error("Critical Error Catch:", {
        message: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        path: req.path,
        method: req.method,
    });

    const statusCode = err.status || 500;
    const message = err.message || "Internal Server Error";

    
    const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));

    if (isJsonRequest) {
        return res.status(statusCode).json({
            success: false,
            message: message,
            stack: process.env.NODE_ENV === "development" ? err.stack : undefined
        });
    }

  
    res.status(statusCode).render("error-500", {
        status: statusCode,
        message: message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
};

module.exports = errorHandler;
