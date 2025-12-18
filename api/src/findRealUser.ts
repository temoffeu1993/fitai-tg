import pg from 'pg';

async function find() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
  });

  await client.connect();
  
  // Find real users
  const users = await client.query(`
    SELECT id, telegram_user_id, created_at 
    FROM users 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  
  console.log(`\n📋 Найдено пользователей: ${users.rows.length}\n`);
  
  if (users.rows.length === 0) {
    console.log('⚠️  Нет пользователей в БД!');
    console.log('\n💡 Создай пользователя:');
    console.log(`
      INSERT INTO users (id, telegram_user_id, created_at)
      VALUES ('11111111-1111-1111-1111-111111111111', 999999999, NOW());
    `);
  } else {
    users.rows.forEach((u, i) => {
      console.log(`${i + 1}. ID: ${u.id}`);
      console.log(`   Telegram: ${u.telegram_user_id}`);
      console.log(`   Создан: ${u.created_at}\n`);
    });
    
    console.log(`💡 Используй ID: ${users.rows[0].id}`);
  }
  
  await client.end();
}

find().catch(console.error);
