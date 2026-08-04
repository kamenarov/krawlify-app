-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'member');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'member';
