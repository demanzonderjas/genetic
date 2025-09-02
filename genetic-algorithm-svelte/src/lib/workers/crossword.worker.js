import { CrosswordGeneticAlgorithm } from '../genetic/CrosswordGA.js';
import { CrosswordGrid } from '../crossword/CrosswordGrid.js';

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    const { type, data } = event.data;
    
    if (type === 'START_EVOLUTION') {
        const { words, config, workerId } = data;
        
        try {
            // Create genetic algorithm instance
            const ga = new CrosswordGeneticAlgorithm(words, config);
            
            let bestSolution = null;
            let currentGeneration = 0;
            
            // Run the evolution
            await ga.run(async (stats) => {
                currentGeneration = stats.generation;
                
                // Track best solution
                if (!bestSolution || stats.bestFitness > bestSolution.fitness) {
                    const gridData = ga.getBestGrid(false);
                    if (gridData) {
                        bestSolution = {
                            grid: gridData.grid,
                            placedWords: gridData.placedWords,
                            gridSize: gridData.gridSize,
                            fitness: stats.bestFitness,
                            workerId: workerId
                        };
                    }
                }
                
                // Send progress update every 5 generations
                if (stats.generation % 5 === 0 || stats.generation === config.generations - 1) {
                    self.postMessage({
                        type: 'PROGRESS',
                        data: {
                            workerId,
                            generation: stats.generation,
                            bestFitness: stats.bestFitness,
                            averageFitness: stats.averageFitness,
                            currentBest: bestSolution
                        }
                    });
                }
            });
            
            // Send final result
            self.postMessage({
                type: 'COMPLETE',
                data: {
                    workerId,
                    bestSolution,
                    finalGeneration: currentGeneration
                }
            });
            
        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                data: {
                    workerId,
                    error: error.message
                }
            });
        }
    }
});