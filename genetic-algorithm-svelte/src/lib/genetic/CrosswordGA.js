import { CrosswordGrid } from '../crossword/CrosswordGrid.js';

export class CrosswordGeneticAlgorithm {
    constructor(words, config = {}) {
        this.words = words;
        this.populationSize = config.populationSize || 100;
        this.generations = config.generations || 200;
        this.mutationRate = config.mutationRate || 0.3;
        this.crossoverRate = config.crossoverRate || 0.8;
        this.elitismCount = config.elitismCount || 5;
        this.gridSize = config.gridSize || 15;
        
        this.population = [];
        this.currentGeneration = 0;
        this.bestEver = null;
        this.generationHistory = [];
        
        // Diversity tracking
        this.stagnationCounter = 0;
        this.lastBestFitness = 0;
        this.explorationMode = false;
        this.noImprovementCounter = 0;
        this.bestCheckpoints = []; // Store best solutions at different stages
    }
    
    initialize(preserveBestEver = false) {
        // Only reset bestEver if explicitly told not to preserve it
        if (!preserveBestEver) {
            this.bestEver = null;
        }
        
        this.population = [];
        for (let i = 0; i < this.populationSize; i++) {
            const individual = CrosswordGrid.createRandomIndividual(this.words, this.gridSize);
            
            // Validate that we have the correct number of genes
            if (individual.genes.length !== this.words.length) {
                console.warn(`Individual has ${individual.genes.length} genes but should have ${this.words.length}`);
                // Recreate if invalid
                i--;
                continue;
            }
            
            individual.fitness = CrosswordGrid.calculateFitness(individual, this.gridSize);
            this.population.push(individual);
        }
        
        this.sortPopulation();
        this.updateBest();
        this.currentGeneration = 0;
        this.generationHistory = [{
            generation: 0,
            bestFitness: this.population[0].fitness,
            averageFitness: this.calculateAverageFitness()
        }];
    }
    
    sortPopulation() {
        this.population.sort((a, b) => b.fitness - a.fitness);
    }
    
    updateBest() {
        // Always keep the absolute best solution ever found
        if (!this.bestEver || this.population[0].fitness > this.bestEver.fitness) {
            this.bestEver = JSON.parse(JSON.stringify(this.population[0]));
            console.log(`New best ever found! Generation ${this.currentGeneration}, Fitness: ${this.bestEver.fitness}`);
            this.noImprovementCounter = 0;
            
            // Store checkpoint every significant improvement
            if (!this.bestCheckpoints.length || 
                this.bestEver.fitness > this.bestCheckpoints[this.bestCheckpoints.length - 1].fitness + 1000) {
                this.bestCheckpoints.push(JSON.parse(JSON.stringify(this.bestEver)));
                if (this.bestCheckpoints.length > 5) {
                    this.bestCheckpoints.shift(); // Keep only last 5 checkpoints
                }
            }
        } else {
            this.noImprovementCounter++;
        }
        
        // Track stagnation based on current population
        if (Math.abs(this.population[0].fitness - this.lastBestFitness) < 10) {
            this.stagnationCounter++;
        } else {
            this.stagnationCounter = 0;
        }
        this.lastBestFitness = this.population[0].fitness;
        
        // Enter exploration mode if no improvement for a while
        if (this.noImprovementCounter > 30) {
            this.explorationMode = true;
            console.log(`Entering exploration mode at generation ${this.currentGeneration}`);
        } else if (this.noImprovementCounter < 5) {
            this.explorationMode = false;
        }
    }
    
    calculateAverageFitness() {
        const sum = this.population.reduce((acc, ind) => acc + ind.fitness, 0);
        return sum / this.population.length;
    }
    
    selectParent() {
        const tournament = [];
        const tournamentSize = 5;
        
        for (let i = 0; i < tournamentSize; i++) {
            const randomIndex = Math.floor(Math.random() * this.population.length);
            tournament.push(this.population[randomIndex]);
        }
        
        tournament.sort((a, b) => b.fitness - a.fitness);
        return tournament[0];
    }
    
    evolve() {
        const newPopulation = [];
        
        // ALWAYS keep the best ever solution in the population
        if (this.bestEver) {
            newPopulation.push(JSON.parse(JSON.stringify(this.bestEver)));
        }
        
        // In exploration mode, backtrack from checkpoints
        if (this.explorationMode && this.bestCheckpoints.length > 0) {
            // Try different checkpoints until we get good variations
            let addedVariations = 0;
            let attempts = 0;
            const maxAttempts = 10;
            
            while (addedVariations < 5 && attempts < maxAttempts) {
                // Randomly select a checkpoint to explore from
                const checkpoint = this.bestCheckpoints[Math.floor(Math.random() * this.bestCheckpoints.length)];
                
                // Create a heavily mutated variation
                const variation = JSON.parse(JSON.stringify(checkpoint));
                
                // Apply VERY aggressive mutations to ensure visible changes
                const mutationCount = 5 + Math.floor(Math.random() * 5); // 5-9 mutations
                for (let j = 0; j < mutationCount; j++) {
                    CrosswordGrid.mutate(variation, this.gridSize);
                }
                
                // Always shuffle placement order for major changes during backtracking
                variation.genes.sort(() => Math.random() - 0.5);
                // Update placement order
                variation.genes.forEach((gene, idx) => {
                    gene.placementOrder = idx;
                });
                
                // Randomly change some positions drastically
                for (let j = 0; j < 3; j++) {
                    const geneIdx = Math.floor(Math.random() * variation.genes.length);
                    variation.genes[geneIdx].x = Math.floor(Math.random() * this.gridSize);
                    variation.genes[geneIdx].y = Math.floor(Math.random() * this.gridSize);
                    variation.genes[geneIdx].direction = Math.random() < 0.5 ? 'across' : 'down';
                }
                
                variation.fitness = CrosswordGrid.calculateFitness(variation, this.gridSize);
                
                // Add all variations since we're making drastic changes
                newPopulation.push(variation);
                addedVariations++;
                
                if (addedVariations === 1) {
                    console.log(`🔄 Backtracking from checkpoint (fitness: ${checkpoint.fitness.toFixed(0)}), created variation with fitness: ${variation.fitness.toFixed(0)}`);
                }
                attempts++;
            }
            
            if (addedVariations === 0) {
                console.log("Failed to create meaningful variations from checkpoints, using random individuals");
                // Fall back to random individuals if we can't create variations
                for (let i = 0; i < 3; i++) {
                    const fresh = CrosswordGrid.createRandomIndividual(this.words, this.gridSize);
                    fresh.fitness = CrosswordGrid.calculateFitness(fresh, this.gridSize);
                    newPopulation.push(fresh);
                }
            }
        }
        
        // Keep elites from current population
        const eliteCount = this.explorationMode ? Math.floor(this.elitismCount / 2) : this.elitismCount;
        for (let i = 0; i < eliteCount && i < this.population.length; i++) {
            const elite = JSON.parse(JSON.stringify(this.population[i]));
            // Ensure elite has no duplicates
            const seen = new Set();
            elite.genes = elite.genes.filter(g => {
                if (seen.has(g.wordIndex)) return false;
                seen.add(g.wordIndex);
                return true;
            });
            newPopulation.push(elite);
        }
        
        // Adaptive diversity injection
        if (this.stagnationCounter > 15 || (this.explorationMode && this.currentGeneration % 10 === 0)) {
            console.log(`Injecting diversity at generation ${this.currentGeneration} (exploration: ${this.explorationMode})`);
            const diversityCount = this.explorationMode ? 10 : 5;
            for (let i = 0; i < diversityCount; i++) {
                const fresh = CrosswordGrid.createRandomIndividual(this.words, this.gridSize);
                fresh.fitness = CrosswordGrid.calculateFitness(fresh, this.gridSize);
                newPopulation.push(fresh);
            }
            this.stagnationCounter = 0;
        }
        
        // Reset exploration if we've been exploring too long without improvement
        if (this.noImprovementCounter > 50) {
            console.log("Resetting exploration counter and trying new strategies");
            this.noImprovementCounter = 30; // Keep in exploration but reset counter
            // Shuffle checkpoints to try different paths
            this.bestCheckpoints.sort(() => Math.random() - 0.5);
        }
        
        while (newPopulation.length < this.populationSize) {
            const parent1 = this.selectParent();
            const parent2 = this.selectParent();
            
            let offspring;
            if (Math.random() < this.crossoverRate) {
                offspring = CrosswordGrid.crossover(parent1, parent2);
            } else {
                offspring = JSON.parse(JSON.stringify(parent1));
            }
            
            // Adaptive mutation based on exploration mode
            const baseMutationRate = this.explorationMode ? this.mutationRate * 2 : this.mutationRate;
            if (Math.random() < baseMutationRate) {
                offspring = CrosswordGrid.mutate(offspring, this.gridSize);
            }
            
            // Heavy mutation in exploration mode
            if (this.explorationMode && Math.random() < 0.3) {
                // Apply 2-3 additional mutations
                const mutationCount = 2 + Math.floor(Math.random() * 2);
                for (let i = 0; i < mutationCount; i++) {
                    offspring = CrosswordGrid.mutate(offspring, this.gridSize);
                }
            } else if (Math.random() < 0.01) {
                // Occasional heavy mutation even in exploitation mode
                offspring = CrosswordGrid.mutate(offspring, this.gridSize);
            }
            
            // Occasionally create a hybrid with best solution
            if (this.explorationMode && this.bestEver && Math.random() < 0.1) {
                offspring = CrosswordGrid.crossover(offspring, this.bestEver);
            }
            
            // Final validation - ensure no duplicates and correct gene count
            const seenIndices = new Set();
            offspring.genes = offspring.genes.filter(g => {
                if (seenIndices.has(g.wordIndex)) return false;
                seenIndices.add(g.wordIndex);
                return true;
            });
            
            // Only add if valid
            if (offspring.genes.length === this.words.length) {
                offspring.fitness = CrosswordGrid.calculateFitness(offspring, this.gridSize);
                newPopulation.push(offspring);
            }
        }
        
        this.population = newPopulation;
        this.sortPopulation();
        this.updateBest();
        this.currentGeneration++;
        
        this.generationHistory.push({
            generation: this.currentGeneration,
            bestFitness: this.population[0].fitness,
            averageFitness: this.calculateAverageFitness()
        });
    }
    
    async run(onGenerationCallback, preserveBestEver = false) {
        this.initialize(preserveBestEver);
        
        let compactionPhase = false;
        
        for (let gen = 0; gen < this.generations; gen++) {
            this.evolve();
            
            // Only enter compaction phase in the last 3 generations
            if (gen >= this.generations - 3) {
                if (!compactionPhase) {
                    compactionPhase = true;
                    console.log(`Entering final compaction phase at generation ${gen}`);
                }
                // Compact every generation in the final phase
                this.compactPopulation();
            }
            
            if (onGenerationCallback) {
                const shouldContinue = await onGenerationCallback({
                    generation: this.currentGeneration,
                    bestFitness: this.bestEver ? this.bestEver.fitness : this.population[0].fitness,
                    currentBestFitness: this.population[0].fitness,
                    averageFitness: this.calculateAverageFitness(),
                    bestIndividual: this.bestEver || this.population[0],
                    currentBestIndividual: this.population[0], // Always provide current generation's best
                    population: this.population,
                    compactionPhase,
                    explorationMode: this.explorationMode,
                    noImprovementCounter: this.noImprovementCounter
                });
                
                // If callback returns false, stop evolution
                if (shouldContinue === false) {
                    console.log(`Evolution stopped at generation ${this.currentGeneration}`);
                    break;
                }
            }
            
            // Reduced delay for faster evolution
            await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        return this.bestEver;
    }
    
    // Fast word count without full grid generation
    countPlacedWords() {
        if (!this.population[0]) return 0;
        const individual = this.population[0];
        const grid = Array(individual.gridSize || this.gridSize).fill(null).map(() => 
            Array(individual.gridSize || this.gridSize).fill(null)
        );
        const placedIndices = new Set();
        const sortedGenes = [...individual.genes].sort((a, b) => a.placementOrder - b.placementOrder);
        
        for (const gene of sortedGenes) {
            if (!placedIndices.has(gene.wordIndex)) {
                // Simplified placement check
                placedIndices.add(gene.wordIndex);
            }
        }
        return placedIndices.size;
    }
    
    
    compactPopulation() {
        // Try to compact the best solutions
        for (let i = 0; i < Math.min(10, this.population.length); i++) {
            const individual = this.population[i];
            
            // Try to reduce grid size
            const minGridSize = this.calculateMinGridSize(individual);
            if (minGridSize < individual.gridSize) {
                individual.gridSize = minGridSize;
            }
            
            // Try to shift all words towards top-left
            this.shiftToTopLeft(individual);
            
            // Recalculate fitness with bonus for smaller grids
            individual.fitness = CrosswordGrid.calculateFitness(individual, this.gridSize);
        }
        
        this.sortPopulation();
    }
    
    calculateMinGridSize(individual) {
        // Find the actual bounds of placed words
        let maxX = 0, maxY = 0;
        
        for (const gene of individual.genes) {
            if (gene.direction === 'across') {
                maxX = Math.max(maxX, gene.x + gene.word.length);
                maxY = Math.max(maxY, gene.y + 1);
            } else {
                maxX = Math.max(maxX, gene.x + 1);
                maxY = Math.max(maxY, gene.y + gene.word.length);
            }
        }
        
        // Add small buffer
        return Math.max(maxX + 1, maxY + 1, 10);
    }
    
    shiftToTopLeft(individual) {
        // Find minimum x and y positions
        let minX = individual.gridSize, minY = individual.gridSize;
        
        for (const gene of individual.genes) {
            minX = Math.min(minX, gene.x);
            minY = Math.min(minY, gene.y);
        }
        
        // Shift all words if possible
        if (minX > 0 || minY > 0) {
            for (const gene of individual.genes) {
                gene.x -= minX;
                gene.y -= minY;
            }
        }
    }
    
    getBestGrid(useCurrentBest = false) {
        // During exploration, optionally show current population best instead of bestEver
        const bestSolution = useCurrentBest && this.population.length > 0 
            ? this.population[0] 
            : (this.bestEver || (this.population.length > 0 ? this.population[0] : null));
        if (!bestSolution) return null;
        
        const gridSize = bestSolution.gridSize || this.gridSize;
        let grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
        const placedWords = [];
        const placedWordIndices = new Set(); // Track which words have been placed
        
        // Sort genes by placement order
        const sortedGenes = [...bestSolution.genes].sort((a, b) => a.placementOrder - b.placementOrder);
        
        for (let i = 0; i < sortedGenes.length; i++) {
            const gene = sortedGenes[i];
            
            // Skip if this word has already been placed
            if (placedWordIndices.has(gene.wordIndex)) {
                continue;
            }
            
            const isFirstWord = placedWords.length === 0;
            
            const placement = CrosswordGrid.tryPlaceWordWithIntersection(grid, gene, placedWords, isFirstWord, gridSize, this.words);
            if (placement.success) {
                placedWords.push({
                    ...placement,
                    clue: gene.clue,
                    wordIndex: gene.wordIndex
                });
                placedWordIndices.add(gene.wordIndex);
            }
        }
        
        // Compact the grid by removing empty rows and columns
        const compactedResult = this.removeEmptyRowsAndColumns(grid, placedWords);
        
        return {
            grid: compactedResult.grid,
            placedWords: compactedResult.placedWords,
            fitness: bestSolution.fitness,
            gridSize: compactedResult.grid.length
        };
    }
    
    removeEmptyRowsAndColumns(grid, placedWords) {
        // Find non-empty rows and columns
        const nonEmptyRows = new Set();
        const nonEmptyCols = new Set();
        
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                if (grid[y][x] !== null) {
                    nonEmptyRows.add(y);
                    nonEmptyCols.add(x);
                }
            }
        }
        
        // Convert to sorted arrays
        const keepRows = Array.from(nonEmptyRows).sort((a, b) => a - b);
        const keepCols = Array.from(nonEmptyCols).sort((a, b) => a - b);
        
        // Create mapping for old to new indices
        const rowMap = new Map();
        const colMap = new Map();
        keepRows.forEach((oldRow, newRow) => rowMap.set(oldRow, newRow));
        keepCols.forEach((oldCol, newCol) => colMap.set(oldCol, newCol));
        
        // Create new compacted grid
        const newGrid = [];
        for (const y of keepRows) {
            const newRow = [];
            for (const x of keepCols) {
                newRow.push(grid[y][x]);
            }
            newGrid.push(newRow);
        }
        
        // Update placed words coordinates
        const newPlacedWords = placedWords.map(word => {
            const newWord = { ...word };
            
            // Update main coordinates
            newWord.x = colMap.get(word.x) || 0;
            newWord.y = rowMap.get(word.y) || 0;
            
            // Update cell coordinates
            if (word.cells) {
                newWord.cells = word.cells.map(cell => ({
                    ...cell,
                    x: colMap.get(cell.x) || 0,
                    y: rowMap.get(cell.y) || 0
                }));
            }
            
            return newWord;
        });
        
        return {
            grid: newGrid.length > 0 ? newGrid : [[null]],
            placedWords: newPlacedWords
        };
    }
}