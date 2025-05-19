import { Response } from "express";

export function handleAPIErrors(error: any, res: Response) {
  console.log(error);
  return res
    .status(500)
    .json({ data: null, status: 500, message: error.message });
}
