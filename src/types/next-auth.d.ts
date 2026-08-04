import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: "admin" | "member";
    };
  }

  interface User {
    role?: "admin" | "member";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
  }
}
