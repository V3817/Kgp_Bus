import { ApiError } from "./ApiError.js";

// higher order function to avoid try catch blocks duplication
export const asyncHandler = (requestHandler) => (req, res, next) => {
  Promise.resolve(requestHandler(req, res, next)).catch((err) => {
    if (err instanceof ApiError) {
      return res.status(err.statusCode || 500).json(err);
    } else {
      ////console.log(err);
      return res.status(500).json({
        message: "Unexpected error occured",
      });
    }
  });
};
