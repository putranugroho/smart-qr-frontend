// lib/jwtServer.js
import { jwtVerify, SignJWT } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function jwtSignServer(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);
}

export async function jwtVerifyServer(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch (err) {
    return null;
  }
}
