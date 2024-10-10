import type { Response, Request, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { JWTPayload } from "../lib";

export function isAuthorized(req: Request, res: Response, next: NextFunction) {
  const data = req.headers["authorization"];

  if (!data)
    return res.status(401).json({ status: 401, error: "Unauthorized" });

  const [prefix, token] = data.split(" ");

  if (prefix !== "Bearer")
    return res.status(401).json({ status: 401, error: "Unauthorized" });

  try {

    const user = verify(token, Buffer.from(process.env.JWT_SECRET, "base64"), {
      algorithms: ["HS256"],
    }) as JWTPayload;

    req.payload = user;

    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ status: 401, error: "Unauthorized" });
  }
}
