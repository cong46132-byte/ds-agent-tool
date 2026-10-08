/*
  Warnings:

  - Added the required column `originalName` to the `FileObject` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN     "originalName" TEXT NOT NULL;
