import pg from 'pg';

async function check() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
  });

  try {
    console.log('🔌 Подключаемся к БД...');
    await client.connect();
    console.log('✅ Подключение успешно!\n');
    
    // Check tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('exercise_progression', 'exercise_history')
      ORDER BY table_name
    `);
    
    console.log(`📋 Таблицы (${tables.rows.length}):`);
    tables.rows.forEach(r => console.log(`  ✅ ${r.table_name}`));
    
    // Count data
    const progCount = await client.query(`SELECT COUNT(*) FROM exercise_progression`);
    const histCount = await client.query(`SELECT COUNT(*) FROM exercise_history`);
    
    console.log(`\n📊 Данные:`);
    console.log(`  exercise_progression: ${progCount.rows[0].count} записей`);
    console.log(`  exercise_history: ${histCount.rows[0].count} тренировок`);
    
    // Sample progression data
    const sampleProg = await client.query(`
      SELECT user_id, exercise_id, current_weight, status
      FROM exercise_progression
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    
    if (sampleProg.rows.length > 0) {
      console.log(`\n📈 Последние 5 записей прогрессии:`);
      sampleProg.rows.forEach(r => {
        console.log(`  • ${r.exercise_id}: ${r.current_weight}кг (${r.status})`);
      });
    }
    
    await client.end();
    console.log(`\n✅ Done!`);
  } catch (err: any) {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  }
}

check();
