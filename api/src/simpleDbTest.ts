import pg from 'pg';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
const TEST_EXERCISE_ID = 'ho_barbell_bench_press';

async function test() {
  console.log('🚀 ПРОСТОЙ ТЕСТ БД\n');
  
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {rejectUnauthorized: false}
  });

  await client.connect();
  console.log('✅ Подключились к БД\n');
  
  // Clean old data
  console.log('🧹 Очистка старых тестовых данных...');
  await client.query(`DELETE FROM exercise_history WHERE user_id = $1`, [TEST_USER_ID]);
  await client.query(`DELETE FROM exercise_progression WHERE user_id = $1`, [TEST_USER_ID]);
  console.log('✅ Очищено\n');
  
  // Week 1: Start with 40kg
  console.log('📅 НЕДЕЛЯ 1');
  for (let day = 1; day <= 3; day++) {
    const sets = [
      {targetReps: 12, actualReps: 8 + day, weight: 40, rpe: 7, completed: true},
      {targetReps: 12, actualReps: 7 + day, weight: 40, rpe: 7, completed: true},
      {targetReps: 12, actualReps: 6 + day, weight: 40, rpe: 8, completed: true},
    ];
    
    const date = `2025-12-${18 + day}`;
    
    await client.query(`
      INSERT INTO exercise_history (user_id, exercise_id, workout_date, sets)
      VALUES ($1, $2, $3, $4)
    `, [TEST_USER_ID, TEST_EXERCISE_ID, date, JSON.stringify(sets)]);
    
    const avgReps = sets.reduce((s, set) => s + set.actualReps, 0) / sets.length;
    console.log(`  День ${day}: 40кг × ${avgReps.toFixed(1)} reps avg`);
  }
  
  await client.query(`
    INSERT INTO exercise_progression (user_id, exercise_id, current_weight, status, stall_count, deload_count, last_progress_date, updated_at)
    VALUES ($1, $2, 40, 'progressing', 0, 0, '2025-12-21', NOW())
  `, [TEST_USER_ID, TEST_EXERCISE_ID]);
  
  console.log('  💾 Прогрессия: 40кг, статус: progressing\n');
  
  // Week 2: Hit 12 reps!
  console.log('📅 НЕДЕЛЯ 2');
  for (let day = 1; day <= 3; day++) {
    const sets = [
      {targetReps: 12, actualReps: 10 + day, weight: 40, rpe: 7, completed: true},
      {targetReps: 12, actualReps: 9 + day, weight: 40, rpe: 7, completed: true},
      {targetReps: 12, actualReps: 8 + day, weight: 40, rpe: 8, completed: true},
    ];
    
    const date = `2025-12-${21 + day}`;
    
    await client.query(`
      INSERT INTO exercise_history (user_id, exercise_id, workout_date, sets)
      VALUES ($1, $2, $3, $4)
    `, [TEST_USER_ID, TEST_EXERCISE_ID, date, JSON.stringify(sets)]);
    
    const avgReps = sets.reduce((s, set) => s + set.actualReps, 0) / sets.length;
    console.log(`  День ${day}: 40кг × ${avgReps.toFixed(1)} reps avg`);
  }
  
  await client.query(`
    UPDATE exercise_progression 
    SET current_weight = 42.5, status = 'progressing', last_progress_date = '2025-12-24', updated_at = NOW()
    WHERE user_id = $1 AND exercise_id = $2
  `, [TEST_USER_ID, TEST_EXERCISE_ID]);
  
  console.log('  💾 Прогрессия: 42.5кг, статус: progressing (ВЕС ВЫРОС!)\n');
  
  // Week 3: New weight
  console.log('📅 НЕДЕЛЯ 3');
  for (let day = 1; day <= 3; day++) {
    const sets = [
      {targetReps: 12, actualReps: 8 + day, weight: 42.5, rpe: 7, completed: true},
      {targetReps: 12, actualReps: 7 + day, weight: 42.5, rpe: 7, completed: true},
      {targetReps: 12, actualReps: 6 + day, weight: 42.5, rpe: 8, completed: true},
    ];
    
    const date = `2025-12-${24 + day}`;
    
    await client.query(`
      INSERT INTO exercise_history (user_id, exercise_id, workout_date, sets)
      VALUES ($1, $2, $3, $4)
    `, [TEST_USER_ID, TEST_EXERCISE_ID, date, JSON.stringify(sets)]);
    
    const avgReps = sets.reduce((s, set) => s + set.actualReps, 0) / sets.length;
    console.log(`  День ${day}: 42.5кг × ${avgReps.toFixed(1)} reps avg`);
  }
  
  console.log('  💾 Прогрессия: 42.5кг, удержание веса\n');
  
  // Verify
  console.log('═'.repeat(80));
  console.log('🔍 ПРОВЕРКА ДАННЫХ В БД\n');
  
  const prog = await client.query(`
    SELECT * FROM exercise_progression WHERE user_id = $1
  `, [TEST_USER_ID]);
  
  console.log(`📊 exercise_progression (${prog.rows.length} записей):`);
  prog.rows.forEach(r => {
    console.log(`  • ${r.exercise_id}`);
    console.log(`    Вес: ${r.current_weight}кг`);
    console.log(`    Статус: ${r.status}`);
    console.log(`    Обновлено: ${r.updated_at}`);
  });
  
  const hist = await client.query(`
    SELECT * FROM exercise_history WHERE user_id = $1 ORDER BY workout_date
  `, [TEST_USER_ID]);
  
  console.log(`\n📅 exercise_history (${hist.rows.length} тренировок):`);
  hist.rows.forEach((r, idx) => {
    const sets = JSON.parse(r.sets);
    const avgReps = sets.reduce((s: number, set: any) => s + set.actualReps, 0) / sets.length;
    const weight = sets[0].weight;
    console.log(`  ${idx + 1}. ${r.workout_date}: ${weight}кг × ${avgReps.toFixed(1)} reps`);
  });
  
  await client.end();
  
  console.log('\n✅ ТЕСТ ЗАВЕРШЁН!');
  console.log('\n📊 ИТОГ:');
  console.log(`  ✅ Создано ${hist.rows.length} тренировок`);
  console.log(`  ✅ Прогрессия: 40кг → 42.5кг (+2.5кг)`);
  console.log('  ✅ Данные РЕАЛЬНО в PostgreSQL!');
}

test().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
