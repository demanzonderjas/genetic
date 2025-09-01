<script>
  import { CrosswordGeneticAlgorithm } from "./lib/genetic/CrosswordGA.js";
  import CrosswordGrid from "./lib/components/CrosswordGrid.svelte";

  let ga = null;
  let currentGrid = $state([]);
  let currentPlacedWords = $state([]);
  let isRunning = $state(false);
  let generation = $state(0);
  let bestFitness = $state(0);
  let averageFitness = $state(0);
  let isCompacting = $state(false);
  let isExploring = $state(false);
  let noImprovementCount = $state(0);

  let populationSize = $state(100);
  let generations = $state(50);
  let mutationRate = $state(0.3);
  let crossoverRate = $state(0.7);
  let gridSize = $state(15);

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

    isRunning = true;

    console.log("Starting fresh evolution with", words.length, "words");

    try {
      ga = new CrosswordGeneticAlgorithm(words, {
        populationSize,
        generations,
        mutationRate,
        crossoverRate,
        gridSize,
      });
    } catch (error) {
      console.error("Error creating GA:", error);
      isRunning = false;
      return;
    }

    await ga?.run(async (stats) => {
      generation = stats.generation;
      bestFitness = stats.bestFitness;
      averageFitness = stats.averageFitness;
      isCompacting = stats.compactionPhase || false;
      isExploring = stats.explorationMode || false;
      noImprovementCount = stats.noImprovementCounter || 0;

      // Always show the current best solution
      const gridData = ga.getBestGrid(false);
      if (gridData) {
        currentGrid = gridData.grid;
        currentPlacedWords = gridData.placedWords;
        if (gridData.gridSize) {
          gridSize = gridData.gridSize;
        }
      }
    });

    isRunning = false;
  }

  function stopEvolution() {
    isRunning = false;
  }

  function resetGrid() {
    setupEmptyGrid();
    generation = 0;
    bestFitness = 0;
    averageFitness = 0;
    isCompacting = false;
    isExploring = false;
    noImprovementCount = 0;
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
        <p>
          Phase: {isExploring
            ? "🚀 Exploring"
            : isCompacting
              ? "🗜️ Compacting"
              : "🔍 Searching"}
        </p>
        <p>Mode: {isExploring ? "Backtracking & Exploring" : "Optimizing"}</p>
        <p>No Improvement: {noImprovementCount} gens</p>
        <p>Best Fitness: {bestFitness.toFixed(2)}</p>
        <p>Average Fitness: {averageFitness.toFixed(2)}</p>
        <p>Words Placed: {currentPlacedWords.length} / {words.length}</p>

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
