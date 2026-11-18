-- DropIndex
DROP INDEX "Project_key_key";

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'MEMBER';
