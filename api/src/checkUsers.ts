import pg from 'pg';

async function check() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
  });

  await client.connect();
  
  console.log('👥 Проверка пользователей в БД...\n');
  
  // Check if user exists
  const testUser = await client.query(`
    SELECT * FROM users WHERE id = '11111111-1111-1111-1111-111111111111'
  `);
  
  console.log(`Тестовый пользователь: ${testUser.rows.length > 0 ? '✅ существует' : '❌ не найден'}`);
  
  if (testUser.rows.length > 0) {
    console.log(`  ID: ${testUser.rows[0].id}`);
    console.log(`  TG ID: ${testUser.rows[0].telegram_user_id}`);
  }
  
  // Show all users
  const allUsers = await client.query(`SELECT id, telegram_user_id, created_at FROM users ORDER BY created_at DESC LIMIT 10`);
  
  console.log(`\n📋 Всего пользователей в БД: ${allUsers.rows.length}\n`);
  
  if (allUsers.rows.length > 0) {
    console.log('Последние пользователи:');
    allUsers.rows.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.id} (TG: ${u.telegram_user_id})`);
    });
    
    console.log(`\n💡 Используй первого: ${allUsers.rows[0].id}`);
  } else {
    console.log('⚠️  БД пустая!');
  }
  
  await client.end();
}

check().catch(console.error);
