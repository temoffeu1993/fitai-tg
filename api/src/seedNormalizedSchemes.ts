// api/src/seedNormalizedSchemes.ts
// ============================================================================
// Seed script: Insert all normalized schemes into database
// 
// Run: npx tsx api/src/seedNormalizedSchemes.ts
// ============================================================================

import { q } from "./db.js";
import { NORMALIZED_SCHEMES } from "./normalizedSchemes.js";

async function seedSchemes() {
  console.log("🌱 Seeding normalized schemes...\n");
  console.log(`Total schemes to insert: ${NORMALIZED_SCHEMES.length}\n`);
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  for (const scheme of NORMALIZED_SCHEMES) {
    try {
      const result = await q(
        `INSERT INTO workout_schemes 
         (id, name, description, days_per_week, min_minutes, max_minutes, split_type, 
          experience_levels, goals, equipment_required, day_labels, benefits, notes, intensity, target_sex)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE 
         SET 
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           days_per_week = EXCLUDED.days_per_week,
           min_minutes = EXCLUDED.min_minutes,
           max_minutes = EXCLUDED.max_minutes,
           split_type = EXCLUDED.split_type,
           experience_levels = EXCLUDED.experience_levels,
           goals = EXCLUDED.goals,
           equipment_required = EXCLUDED.equipment_required,
           day_labels = EXCLUDED.day_labels,
           benefits = EXCLUDED.benefits,
           notes = EXCLUDED.notes,
           intensity = EXCLUDED.intensity,
           target_sex = EXCLUDED.target_sex
         RETURNING (xmax = 0) AS inserted`,
        [
          scheme.id,
          scheme.name,
          scheme.description,
          scheme.daysPerWeek,
          scheme.timeBuckets[0],
          scheme.timeBuckets[scheme.timeBuckets.length - 1],
          scheme.splitType,
          scheme.experienceLevels,
          scheme.goals,
          scheme.equipment,
          JSON.stringify(scheme.days.map(d => ({
            day: d.day,
            label: d.label,
            focus: d.focus,
            templateRulesId: d.templateRulesId,
            requiredPatterns: d.requiredPatterns,
            optionalPatterns: d.optionalPatterns,
          }))),
          scheme.benefits,
          scheme.notes || null,
          scheme.intensity,
          scheme.targetSex || 'any',
        ]
      );
      
      if (result[0]?.inserted) {
        inserted++;
        console.log(`✅ Inserted: ${scheme.id} - ${scheme.russianName}`);
      } else {
        updated++;
        console.log(`🔄 Updated: ${scheme.id} - ${scheme.russianName}`);
      }
    } catch (error: any) {
      errors++;
      console.error(`❌ Error: ${scheme.id} - ${error.message}`);
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY:");
  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   🔄 Updated: ${updated}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📦 Total: ${NORMALIZED_SCHEMES.length}`);
  console.log("=".repeat(80));
  
  if (errors === 0) {
    console.log("\n✅ All schemes seeded successfully! 🎉\n");
  } else {
    console.log("\n⚠️ Some schemes failed to seed. Check errors above.\n");
  }
  
  process.exit(errors > 0 ? 1 : 0);
}

// Run seed
seedSchemes().catch(err => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
