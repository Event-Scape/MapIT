import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "DATABASE_URL 이 없습니다. Supabase 대시보드 → Project Settings → Database → Connection string 의 URI 를 .env 에 넣으세요.\n" +
      "또는 README 대로 SQL Editor 에서 supabase/schema.sql 전체를 붙여 넣어 실행하세요."
  );
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("OK: supabase/schema.sql 적용됨.");
} finally {
  await client.end();
}
