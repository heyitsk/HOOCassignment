/*
  Warnings:

  - You are about to drop the column `posted` on the `Post` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[key]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `key` to the `Post` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PENDING', 'UPLOADED', 'FAILED');

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "posted",
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "url" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Post_key_key" ON "Post"("key");
