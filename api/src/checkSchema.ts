import pg from 'pg';

async function check() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
  });

  await client.connect();
  
  console.log('🔍 Проверка схемы таблиц...\n');
  
  // Check users table schema
  const usersSchema = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `);
  
  console.log(`📋 Таблица users (${usersSchema.rows.length} колонок):`);
  usersSchema.rows.forEach(r => {
    console.log(`  • ${r.column_name}: ${r.data_type}`);
  });
  
  // Count users
  const count = await client.query(`SELECT COUNT(*) FROM users`);
  console.log(`\n👥 Всего пользователей: ${count.rows[0].count}`);
  
  // Sample user
  if (parseInt(count.rows[0].count) > 0) {
    const sample = await client.query(`SELECT * FROM users LIMIT 1`);
    console.log('\n📝 Пример записи:');
    console.log(JSON.stringify(sample.rows[0], null, 2));
  }
  
  await client.end();
}

check().catch(console.error);
