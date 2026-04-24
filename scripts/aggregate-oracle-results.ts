import fs from "node:fs";
import path from "node:path";

const RESULTS_DIR = path.join(process.cwd(), "docs/internal/oracle-results");
const CATEGORY_OUTPUT = path.join(process.cwd(), "docs/internal/category-evolution-data.json");
const THRESHOLD_OUTPUT = path.join(process.cwd(), "docs/internal/threshold-analysis.json");

type Evaluation = {
  tag: string;
  localScore: number;
  llmJudge: number;
  evalConfidence: number;
  reason: string;
};

type ResultFile = {
  skillSlug: string;
  sourcePath: string;
  model: string;
  evaluatedAt: string;
  batchSize: number;
  durationMs: number;
  categories: string[];
  evaluations: Evaluation[];
};

async function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`Results directory not found: ${RESULTS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"));
  console.log(`Found ${files.length} result files.`);

  const categoryCounts = new Map<string, number>();
  const allEvals: Evaluation[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8");
    try {
      const data = JSON.parse(content) as ResultFile;
      
      // Aggregate categories
      if (data.categories && Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          const normalized = cat.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          if (normalized) {
            categoryCounts.set(normalized, (categoryCounts.get(normalized) || 0) + 1);
          }
        }
      }

      // Aggregate evaluations
      if (data.evaluations && Array.isArray(data.evaluations)) {
        allEvals.push(...data.evaluations);
      }
    } catch (e) {
      console.error(`Error parsing ${file}:`, e);
    }
  }

  // Save category frequencies
  const sortedCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  fs.writeFileSync(CATEGORY_OUTPUT, JSON.stringify(sortedCategories, null, 2), "utf-8");
  console.log(`Saved ${sortedCategories.length} unique categories to ${CATEGORY_OUTPUT}`);

  // Calculate Threshold metrics
  const thresholds = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
  const metrics: any[] = [];

  for (const threshold of thresholds) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    for (const ev of allEvals) {
      const isPositive = ev.localScore >= threshold;
      const isGood = ev.llmJudge === 1;

      if (isPositive && isGood) tp++;
      else if (isPositive && !isGood) fp++;
      else if (!isPositive && isGood) fn++;
      else tn++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    metrics.push({
      threshold,
      tp,
      fp,
      fn,
      tn,
      precision,
      recall,
      f1
    });
  }

  console.log("\nThreshold Analysis:");
  console.table(metrics.map(m => ({
    Threshold: m.threshold.toFixed(2),
    Precision: (m.precision * 100).toFixed(2) + "%",
    Recall: (m.recall * 100).toFixed(2) + "%",
    F1: m.f1.toFixed(4)
  })));

  fs.writeFileSync(THRESHOLD_OUTPUT, JSON.stringify(metrics, null, 2), "utf-8");
  
  // Find optimal threshold (max F1)
  const optimal = metrics.reduce((max, m) => m.f1 > max.f1 ? m : max, metrics[0]);
  console.log(`\nOptimal Threshold (Max F1): ${optimal.threshold.toFixed(2)} (F1: ${optimal.f1.toFixed(4)}, Precision: ${(optimal.precision * 100).toFixed(2)}%, Recall: ${(optimal.recall * 100).toFixed(2)}%)`);
}

main().catch(console.error);
