import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const modulePath = process.argv[2] || path.resolve(root, '../../tmp/db-validation/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath));
const db = new PGlite();
try {
  await db.exec(await fs.readFile(path.join(root, 'schema.sql'), 'utf8'));
  console.log('BASELINE EXECUTED', (await db.query('select version()')).rows[0]);
  const queries = {
    columns: `SELECT n.nspname AS schema,t.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS required, a.attgenerated AS generated, pg_get_expr(d.adbin,d.adrelid) AS default,
      col_description(t.oid,a.attnum) AS description
      FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
      WHERE t.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY n.nspname,t.relname,a.attnum`,
    constraints: `SELECT n.nspname AS schema,t.relname AS table,c.conname AS name,c.contype AS type,
      pg_get_constraintdef(c.oid) AS definition,
      ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      rn.nspname AS target_schema,rt.relname AS target_table,
      ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS target_columns
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_class rt ON rt.oid=c.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,t.relname,c.conname`,
    indexes: `SELECT schemaname AS schema,tablename AS table,indexname AS name,indexdef AS definition FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename,indexname`,
    views: `SELECT schemaname AS schema,viewname AS name,definition FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,viewname`,
    enums: `SELECT n.nspname AS schema,t.typname AS name,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace GROUP BY n.nspname,t.typname ORDER BY n.nspname,t.typname`,
    triggers: `SELECT event_object_schema AS schema,event_object_table AS table,trigger_name AS name,action_statement AS definition FROM information_schema.triggers ORDER BY 1,2,3`,
  };
  const catalog = {};
  for (const [key,sql] of Object.entries(queries)) catalog[key] = (await db.query(sql)).rows;
  await fs.writeFile(path.join(root,'catalog.json'), JSON.stringify(catalog,null,2)+'\n');
  console.log('CATALOG', new Set(catalog.columns.map(c=>c.schema+'.'+c.table)).size, 'tables;',catalog.constraints.filter(c=>c.type==='f').length,'FKs');
  const testFile=path.join(root,'tests/smoke.sql');
  try { await db.exec(await fs.readFile(testFile,'utf8')); console.log('SMOKE TESTS PASSED'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
} catch(e) {
  console.error('VALIDATION FAILED:',e.message, 'position:',e.position, 'detail:',e.detail);
  if(e.position) { const sql=await fs.readFile(path.join(root,'schema.sql'),'utf8'); const n=Number(e.position); console.error(sql.slice(Math.max(0,n-250),n+250)); }
  process.exitCode=1;
} finally { await db.close(); }
