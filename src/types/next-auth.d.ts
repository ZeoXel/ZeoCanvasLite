import { DefaultSession, DefaultUser } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      role: 'user' | 'admin' | 'super_admin'
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    id: string
    role: 'user' | 'admin' | 'super_admin'
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: 'user' | 'admin' | 'super_admin'
  }
}