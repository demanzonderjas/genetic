<script>
  import { CrosswordGeneticAlgorithm } from "./lib/genetic/CrosswordGA.js";
  import CrosswordGrid from "./lib/components/CrosswordGrid.svelte";
  import { onDestroy } from "svelte";

  let ga = null;
  let activeEvolutions = []; // Track active GA instances
  let currentGrid = $state([]);
  let currentPlacedWords = $state([]);
  let isRunning = $state(false);
  let generation = $state(0);
  let bestFitness = $state(0);
  let averageFitness = $state(0);
  let isCompacting = $state(false);
  let isExploring = $state(false);
  let noImprovementCount = $state(0);
  let bestSolutionDuringRun = null; // Track best during current run only
  let absoluteBestEver = null; // Track the absolute best solution ever found
  let workers = []; // Web workers for parallel execution
  let workerProgress = $state({}); // Track progress of each worker
  let parallelRuns = $state(4); // Number of parallel instances
  let injectionEvents = $state([]); // Track injection events

  let populationSize = $state(200);
  let generations = $state(75);
  let mutationRate = $state(0.85);
  let crossoverRate = $state(0.5);
  let gridSize = $state(14);

  const sampleWords = [
    { text: "ALGORITHM", clue: "Step-by-step procedure" },
    { text: "GENETIC", clue: "Related to genes" },
    { text: "EVOLUTION", clue: "Gradual development" },
    { text: "CROSSWORD", clue: "Word puzzle" },
    { text: "OPTIMIZE", clue: "Make the best of" },
    { text: "FITNESS", clue: "Suitability score" },
    { text: "MUTATION", clue: "Random change" },
    { text: "SELECTION", clue: "Choosing process" },
    { text: "POPULATION", clue: "Group of individuals" },
    { text: "GENERATION", clue: "Single iteration" },
    // Shorter words to fill gaps
    { text: "GENE", clue: "Heredity unit" },
    { text: "CODE", clue: "Programming text" },
    { text: "GRID", clue: "Matrix structure" },
    { text: "WORD", clue: "Language unit" },
    { text: "TEST", clue: "Evaluation" },
  ];

  let words = $state([...sampleWords]);
  let customWords = $state("");

  function parseCustomWords() {
    if (!customWords.trim()) {
      words = [...sampleWords];
      return;
    }

    const lines = customWords.split("\n").filter((line) => line.trim());
    words = lines
      .map((line) => {
        const [text, ...clueParts] = line.split("|");
        return {
          text: text
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, ""),
          clue: clueParts.join("|").trim() || "No clue provided",
        };
      })
      .filter((word) => word.text.length > 0);
  }

  async function startEvolution() {
    if (isRunning) return;

    parseCustomWords();

    if (words.length === 0) {
      alert("Please add some words first!");
      return;
    }

    // Reset all state for fresh start
    generation = 0;
    bestFitness = 0;
    averageFitness = 0;
    isCompacting = false;
    isExploring = false;
    noImprovementCount = 0;
    bestSolutionDuringRun = null;
    absoluteBestEver = null;
    workerProgress = {};
    injectionEvents = [];

    isRunning = true;
    activeEvolutions = []; // Clear previous evolutions

    console.log(
      `Starting ${parallelRuns} parallel evolutions with`,
      words.length,
      "words"
    );

    const config = {
      populationSize,
      generations,
      mutationRate,
      crossoverRate,
      gridSize,
    };

    // Run parallel evolutions
    const evolutionPromises = [];

    for (let i = 0; i < parallelRuns; i++) {
      workerProgress[i] = { generation: 0, bestFitness: 0 };

      const evolutionPromise = runSingleEvolution(i, words, config);
      evolutionPromises.push(evolutionPromise);
    }

    try {
      // Wait for all evolutions to complete
      const results = await Promise.all(evolutionPromises);

      // Find the best solution across all runs (from their final states)
      const bestFinalResult = results.reduce((best, current) => {
        if (!best || (current && current.fitness > best.fitness)) {
          return current;
        }
        return best;
      }, null);

      // Use the absolute best ever found (which might be better than final results)
      const bestToDisplay = absoluteBestEver || bestFinalResult;

      // Display the best solution
      if (bestToDisplay) {
        currentGrid = bestToDisplay.grid;
        currentPlacedWords = bestToDisplay.placedWords;
        if (bestToDisplay.gridSize) {
          gridSize = bestToDisplay.gridSize;
        }
        bestFitness = bestToDisplay.fitness;

        // Log comparison if absolute best is better than final
        if (absoluteBestEver && bestFinalResult) {
          if (absoluteBestEver.fitness > bestFinalResult.fitness) {
            console.log(
              `Evolution complete. Using absolute best (fitness: ${absoluteBestEver.fitness.toFixed(0)}) ` +
                `which is better than best final result (fitness: ${bestFinalResult.fitness.toFixed(0)})`
            );
          } else {
            console.log(
              `Evolution complete. Final result matches absolute best with fitness: ${bestToDisplay.fitness.toFixed(0)}`
            );
          }
        } else {
          console.log(
            `Evolution complete. Best solution with fitness: ${bestToDisplay.fitness.toFixed(0)}`
          );
        }
      }
    } catch (error) {
      console.error("Error during parallel evolution:", error);
    }

    isRunning = false;
  }

  async function runSingleEvolution(runId, words, config) {
    console.log(`Starting evolution run ${runId + 1}`);

    const ga = new CrosswordGeneticAlgorithm(words, config);
    activeEvolutions.push(ga); // Track active GA instance
    let runBestSolution = null;

    await ga.run(async (stats) => {
      // Check if we should stop
      if (!isRunning) {
        return false; // Signal to stop evolution
      }
      // Update progress for this run
      workerProgress[runId] = {
        generation: stats.generation,
        bestFitness: stats.bestFitness,
        injections: ga.injectionAttempts || 0,
      };

      // Track best solution for this run
      if (!runBestSolution || stats.bestFitness > runBestSolution.fitness) {
        const gridData = ga.getBestGrid(false);
        if (gridData) {
          runBestSolution = {
            grid: gridData.grid,
            placedWords: gridData.placedWords,
            gridSize: gridData.gridSize,
            fitness: stats.bestFitness,
            runId: runId,
            genes: stats.bestIndividual.genes, // Store genes for injection
          };
        }
      }

      // Update overall best if this run found something better
      if (
        !bestSolutionDuringRun ||
        stats.bestFitness > bestSolutionDuringRun.fitness
      ) {
        bestSolutionDuringRun = runBestSolution;
        bestFitness = stats.bestFitness;

        // Also track absolute best ever (never degrades)
        if (
          !absoluteBestEver ||
          runBestSolution.fitness > absoluteBestEver.fitness
        ) {
          absoluteBestEver = JSON.parse(JSON.stringify(runBestSolution));
          console.log(
            `New absolute best ever! Fitness: ${absoluteBestEver.fitness.toFixed(0)} from run ${runId + 1}`
          );
        }

        // Update display with current best
        if (runBestSolution) {
          currentGrid = runBestSolution.grid;
          currentPlacedWords = runBestSolution.placedWords;
          if (runBestSolution.gridSize) {
            gridSize = runBestSolution.gridSize;
          }
        }

        // Share the global best with all other workers for potential injection
        activeEvolutions.forEach((evolution, idx) => {
          if (idx !== runId && bestSolutionDuringRun) {
            // Create a simplified version with just the essential data
            const globalBestData = {
              genes: stats.bestIndividual.genes,
              fitness: bestSolutionDuringRun.fitness,
              gridSize: stats.bestIndividual.gridSize || gridSize,
            };
            evolution.updateInjectionTracking(globalBestData);
          }
        });
      } else {
        // Even if not the global best, update injection tracking
        if (bestSolutionDuringRun && stats.bestIndividual) {
          const globalBestData = {
            genes: bestSolutionDuringRun.genes || stats.bestIndividual.genes,
            fitness: bestSolutionDuringRun.fitness,
            gridSize: bestSolutionDuringRun.gridSize || gridSize,
          };
          ga.updateInjectionTracking(globalBestData);
        }
      }

      // Calculate average stats across all runs
      const progressValues = Object.values(workerProgress);
      generation = Math.round(
        progressValues.reduce((sum, p) => sum + p.generation, 0) /
          progressValues.length
      );
      averageFitness =
        progressValues.reduce((sum, p) => sum + p.bestFitness, 0) /
        progressValues.length;

      // Small delay to allow UI updates
      if (stats.generation % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    return runBestSolution;
  }

  function stopEvolution() {
    isRunning = false;
    // The GA instances will stop on next iteration when they check isRunning
    activeEvolutions = [];
  }

  // Clean up on component destroy
  onDestroy(() => {
    stopEvolution();
  });

  function resetGrid() {
    setupEmptyGrid();
    generation = 0;
    bestFitness = 0;
    averageFitness = 0;
    isCompacting = false;
    isExploring = false;
    noImprovementCount = 0;
    bestSolutionDuringRun = null;
    ga = null;
  }

  function setupEmptyGrid() {
    currentGrid = Array(gridSize)
      .fill(null)
      .map(() => Array(gridSize).fill(null));
    currentPlacedWords = [];

    // Add a sample word to show the grid is working
    const sampleWord = "EXAMPLE";
    const startX = Math.floor((gridSize - sampleWord.length) / 2);
    const startY = Math.floor(gridSize / 2);

    for (let i = 0; i < sampleWord.length; i++) {
      if (currentGrid[startY]) {
        currentGrid[startY][startX + i] = sampleWord[i];
      }
    }

    currentPlacedWords = [
      {
        word: sampleWord,
        x: startX,
        y: startY,
        direction: "across",
        clue: "Sample word - click Start Evolution to optimize!",
      },
    ];
  }

  $effect(() => {
    if (!currentGrid.length) {
      setupEmptyGrid();
    }
  });

  // Calculate grid statistics
  let totalCells = $derived(currentGrid.length * (currentGrid[0]?.length || 0));
  let filledCells = $derived.by(() => {
    let count = 0;
    for (let row of currentGrid) {
      for (let cell of row) {
        if (cell !== null && cell !== undefined) {
          count++;
        }
      }
    }
    return count;
  });
  let blankCells = $derived(totalCells - filledCells);
</script>

<main>
  <h1>Genetic Algorithm Crossword Optimizer</h1>

  <div class="container">
    <div class="controls">
      <h2>Algorithm Parameters</h2>

      <div class="control-group">
        <label>
          Population Size:
          <input
            type="number"
            bind:value={populationSize}
            min="10"
            max="200"
            disabled={isRunning}
          />
        </label>

        <label>
          Generations:
          <input
            type="number"
            bind:value={generations}
            min="10"
            max="1000"
            disabled={isRunning}
          />
        </label>

        <label>
          Mutation Rate:
          <input
            type="number"
            bind:value={mutationRate}
            min="0"
            max="1"
            step="0.01"
            disabled={isRunning}
          />
        </label>

        <label>
          Crossover Rate:
          <input
            type="number"
            bind:value={crossoverRate}
            min="0"
            max="1"
            step="0.1"
            disabled={isRunning}
          />
        </label>

        <label>
          Grid Size:
          <input
            type="number"
            bind:value={gridSize}
            min="10"
            max="20"
            disabled={isRunning}
          />
        </label>

        <label>
          Parallel Runs:
          <input
            type="number"
            bind:value={parallelRuns}
            min="1"
            max="8"
            disabled={isRunning}
          />
        </label>
      </div>

      <h2>Words & Clues</h2>
      <p class="hint">Format: WORD | Clue (one per line)</p>
      <textarea
        bind:value={customWords}
        placeholder="ALGORITHM | Step-by-step procedure&#10;GENETIC | Related to genes&#10;Or leave empty for sample words"
        disabled={isRunning}
      ></textarea>

      <div class="button-group">
        {#if !isRunning}
          <button onclick={startEvolution} class="primary"
            >Start Evolution</button
          >
          <button onclick={resetGrid}>Reset</button>
        {:else}
          <button onclick={stopEvolution} class="danger">Stop</button>
        {/if}
      </div>

      <div class="stats">
        <h3>Algorithm Stats</h3>
        <p>Generation: {generation}</p>
        <p>Best Fitness: {bestFitness.toFixed(2)}</p>
        <p>Average Fitness: {averageFitness.toFixed(2)}</p>
        <p>Words Placed: {currentPlacedWords.length} / {words.length}</p>

        {#if isRunning && Object.keys(workerProgress).length > 0}
          <h4 style="margin-top: 0.5rem;">Parallel Run Progress:</h4>
          {#each Object.entries(workerProgress) as [id, progress]}
            <p style="font-size: 0.8rem;">
              Run {parseInt(id) + 1}: Gen {progress.generation}, Fitness {progress.bestFitness.toFixed(
                0
              )}
              {#if progress.injections > 0}
                <span style="color: #e74c3c;"> (💉 {progress.injections})</span>
              {/if}
            </p>
          {/each}
        {/if}

        <h3 style="margin-top: 1rem;">Grid Stats</h3>
        <p>Grid Size: {currentGrid.length} × {currentGrid[0]?.length || 0}</p>
        <p>Total Cells: {totalCells}</p>
        <p>
          Filled Cells: {filledCells} ({totalCells > 0
            ? ((filledCells / totalCells) * 100).toFixed(1)
            : 0}%)
        </p>
        <p>
          Blank Cells: {blankCells} ({totalCells > 0
            ? ((blankCells / totalCells) * 100).toFixed(1)
            : 0}%)
        </p>
      </div>
    </div>

    <div class="visualization">
      <h2>Crossword Grid</h2>
      <CrosswordGrid
        grid={currentGrid}
        placedWords={currentPlacedWords}
        cellSize={30}
      />
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }

  main {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  h1 {
    text-align: center;
    color: white;
    margin-bottom: 2rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  }

  .container {
    display: grid;
    grid-template-columns: 350px minmax(0, 1fr);
    gap: 2rem;
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: visible;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    color: black;
  }

  input[type="number"] {
    width: 100px;
    padding: 0.25rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  textarea {
    width: 100%;
    height: 150px;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
    resize: vertical;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: #666;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
  }

  button {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
    font-weight: 600;
  }

  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  button.danger {
    background: #e74c3c;
    color: white;
  }

  button:not(.primary):not(.danger) {
    background: #ecf0f1;
    color: #2c3e50;
  }

  .stats {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    color: black;
  }

  .stats h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
  }

  .stats p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }

  .visualization {
    overflow: auto;
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    border-radius: 8px;
    padding: 1rem;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 1.2rem;
    color: #2c3e50;
  }

  .visualization h2 {
    width: 100%;
    text-align: center;
    color: #34495e;
    font-weight: 600;
  }
</style>
