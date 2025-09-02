export class CrosswordGrid {
    constructor(words) {
        this.words = words;
        this.gridSize = 15;
        this.grid = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
        this.placedWords = [];
    }

    static createRandomIndividual(words, baseGridSize = 15) {
        // Calculate minimum required grid size based on longest word
        const longestWord = Math.max(...words.map(w => w.text.length));
        const minGridSize = Math.max(10, longestWord + 2);
        const maxGridSize = Math.min(20, baseGridSize + 5);
        
        // Random grid size between min and max
        const gridSize = minGridSize + Math.floor(Math.random() * (maxGridSize - minGridSize + 1));
        
        const individual = {
            genes: [],
            fitness: 0,
            gridSize: gridSize
        };

        // Create a placement order - prefer longer words first, short words last to fill gaps
        let placementOrder = Array.from({length: words.length}, (_, i) => i);
        
        // Sort by word length (longer first) with some randomness
        placementOrder.sort((a, b) => {
            const lengthDiff = words[b].text.length - words[a].text.length;
            // Add some randomness for words of similar length
            if (Math.abs(lengthDiff) <= 1) {
                return Math.random() - 0.5;
            }
            return lengthDiff;
        });
        
        // Add more randomness while keeping general order
        for (let i = 0; i < placementOrder.length - 1; i++) {
            if (Math.random() < 0.3) { // 30% chance to swap with next
                const j = Math.min(i + 1 + Math.floor(Math.random() * 2), placementOrder.length - 1);
                [placementOrder[i], placementOrder[j]] = [placementOrder[j], placementOrder[i]];
            }
        }

        // IMPORTANT: Only create ONE gene per word
        words.forEach((word, index) => {
            // Random initial positions (will be adjusted during placement)
            const x = Math.floor(Math.random() * Math.max(1, gridSize - word.text.length));
            const y = Math.floor(Math.random() * Math.max(1, gridSize - word.text.length));
            const direction = Math.random() > 0.5 ? 'across' : 'down';
            
            individual.genes.push({
                wordIndex: index,
                word: word.text,
                clue: word.clue,
                x: x,
                y: y,
                direction: direction,
                placementOrder: placementOrder[index]
            });
        });

        // Ensure no duplicate wordIndices
        const seen = new Set();
        individual.genes = individual.genes.filter(gene => {
            if (seen.has(gene.wordIndex)) {
                return false;
            }
            seen.add(gene.wordIndex);
            return true;
        });

        return individual;
    }

    static calculateFitness(individual, baseGridSize = 15) {
        let fitness = 0;
        const gridSize = individual.gridSize || baseGridSize;
        const grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
        const placedWords = [];
        const placedWordIndices = new Set(); // Track which words have been placed
        
        // Sort genes by placement order
        const sortedGenes = [...individual.genes].sort((a, b) => a.placementOrder - b.placementOrder);
        
        for (let i = 0; i < sortedGenes.length; i++) {
            const gene = sortedGenes[i];
            
            // Skip if this word has already been placed
            if (placedWordIndices.has(gene.wordIndex)) {
                continue;
            }
            
            const isFirstWord = placedWords.length === 0;
            
            // Try to place the word with intersection requirement
            const placement = this.tryPlaceWordWithIntersection(grid, gene, placedWords, isFirstWord, gridSize);
            if (placement.success) {
                placedWords.push(placement);
                placedWordIndices.add(gene.wordIndex);
            }
        }

        const totalWords = individual.genes.length;
        const wordsPlaced = placedWords.length;
        
        // Base fitness on placement success
        fitness = wordsPlaced * 1000;
        
        // Count total intersections
        const totalIntersections = placedWords.reduce((sum, word) => sum + (word.intersections || 0), 0);
        
        // Bonus for intersections (critical for crossword quality)
        fitness += totalIntersections * 200;
        
        // Check connectivity - all words should be connected in one group
        const isConnected = this.checkConnectivity(placedWords);
        if (!isConnected && placedWords.length > 1) {
            fitness -= 5000; // Heavy penalty for disconnected words
        }
        
        // Bonus for placing all words
        if (wordsPlaced === totalWords) {
            fitness += 20000;
            
            // Count blank cells (cells without letters)
            const blankCells = this.countBlankCells(grid);
            const totalCells = gridSize * gridSize;
            const filledRatio = 1 - (blankCells / totalCells);
            
            // HEAVILY favor compactness (fewer blank cells is better)
            // Increased from 5000 to 15000 for much stronger preference
            fitness += filledRatio * 15000;
            
            // Additional progressive penalty for blank cells
            // The more blank cells, the exponentially worse the penalty
            const blankPenalty = Math.pow(blankCells, 1.5) * 10;
            fitness -= blankPenalty;
            
            // Extra bonus for very compact solutions (>60% filled)
            if (filledRatio > 0.6) {
                fitness += (filledRatio - 0.6) * 25000; // Big bonus for very compact solutions
            }
            
            // Bonus for smaller grid sizes (if all words fit)
            fitness += (20 - gridSize) * 500;
            
            // Bonus for top-left positioning
            const positionBonus = this.calculateTopLeftBonus(placedWords, gridSize);
            fitness += positionBonus * 100;
        }
        
        // Penalty for words without intersections (except first word)
        const wordsWithoutIntersections = placedWords.filter((w, i) => i > 0 && w.intersections === 0).length;
        fitness -= wordsWithoutIntersections * 3000;

        return Math.max(0, fitness);
    }

    static checkConnectivity(placedWords) {
        if (placedWords.length <= 1) return true;
        
        // Build adjacency graph
        const graph = new Map();
        placedWords.forEach((word, i) => {
            graph.set(i, new Set());
        });
        
        // Check for intersections between words
        for (let i = 0; i < placedWords.length; i++) {
            for (let j = i + 1; j < placedWords.length; j++) {
                const word1 = placedWords[i];
                const word2 = placedWords[j];
                
                // Check if words intersect
                if (this.wordsIntersect(word1, word2)) {
                    graph.get(i).add(j);
                    graph.get(j).add(i);
                }
            }
        }
        
        // BFS to check if all words are connected
        const visited = new Set();
        const queue = [0];
        visited.add(0);
        
        while (queue.length > 0) {
            const current = queue.shift();
            for (const neighbor of graph.get(current)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        
        return visited.size === placedWords.length;
    }

    static wordsIntersect(word1, word2) {
        // Check if two placed words intersect
        if (word1.direction === word2.direction) return false; // Can't intersect if parallel
        
        const word1Cells = new Set();
        for (let i = 0; i < word1.word.length; i++) {
            const x = word1.direction === 'across' ? word1.x + i : word1.x;
            const y = word1.direction === 'down' ? word1.y + i : word1.y;
            word1Cells.add(`${x},${y}`);
        }
        
        for (let i = 0; i < word2.word.length; i++) {
            const x = word2.direction === 'across' ? word2.x + i : word2.x;
            const y = word2.direction === 'down' ? word2.y + i : word2.y;
            if (word1Cells.has(`${x},${y}`)) {
                return true;
            }
        }
        
        return false;
    }
    
    static countBlankCells(grid) {
        let blankCount = 0;
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                if (grid[y][x] === null) {
                    blankCount++;
                }
            }
        }
        return blankCount;
    }
    
    static calculateTopLeftBonus(placedWords, gridSize) {
        if (placedWords.length === 0) return 0;
        
        // Calculate average distance from top-left corner
        let totalDistance = 0;
        let cellCount = 0;
        
        for (const word of placedWords) {
            if (word.cells) {
                for (const cell of word.cells) {
                    // Distance from top-left corner (0,0)
                    const distance = Math.sqrt(cell.x * cell.x + cell.y * cell.y);
                    totalDistance += distance;
                    cellCount++;
                }
            }
        }
        
        if (cellCount === 0) return 0;
        
        const avgDistance = totalDistance / cellCount;
        const maxDistance = Math.sqrt(2 * gridSize * gridSize);
        
        // Return bonus (higher when closer to top-left)
        return Math.max(0, 1 - (avgDistance / maxDistance)) * 10;
    }

    static tryPlaceWordWithIntersection(grid, gene, placedWords, isFirstWord, gridSize) {
        const { word, x, y, direction } = gene;
        
        // If it's the first word, place it in center
        if (isFirstWord) {
            const centerGene = {
                ...gene,
                x: Math.floor((gridSize - word.length) / 2),
                y: Math.floor(gridSize / 2),
                direction: 'across'
            };
            return this.tryPlaceWord(grid, centerGene, placedWords);
        }
        
        // For all words after the first, REQUIRE intersection
        // Find all possible intersection points
        const possibleIntersections = this.findAllIntersectionPoints(grid, gene, placedWords, gridSize);
        
        if (possibleIntersections.length > 0) {
            // Sort by score (more intersections is better)
            possibleIntersections.sort((a, b) => b.score - a.score);
            
            // Try the best intersection points
            for (const intersection of possibleIntersections.slice(0, 10)) {
                const modifiedGene = {
                    ...gene,
                    x: intersection.x,
                    y: intersection.y,
                    direction: intersection.direction
                };
                
                const result = this.tryPlaceWord(grid, modifiedGene, placedWords);
                if (result.success && result.intersections > 0) {
                    return result;
                }
            }
        }
        
        // NO FALLBACK for non-first words - they MUST intersect
        // Return failure if no intersection found
        return { success: false, score: 0 };
    }
    
    static findAllIntersectionPoints(grid, gene, placedWords, gridSize) {
        const { word } = gene;
        const possiblePlacements = [];
        
        for (const placedWord of placedWords) {
            // Find common letters
            for (let i = 0; i < word.length; i++) {
                for (let j = 0; j < placedWord.word.length; j++) {
                    if (word[i] === placedWord.word[j]) {
                        // Calculate position for perpendicular intersection
                        const newDirection = placedWord.direction === 'across' ? 'down' : 'across';
                        const newX = placedWord.direction === 'across' ? placedWord.x + j : placedWord.x - i;
                        const newY = placedWord.direction === 'across' ? placedWord.y - i : placedWord.y + j;
                        
                        // Check if position is within bounds
                        const endX = newDirection === 'across' ? newX + word.length : newX;
                        const endY = newDirection === 'down' ? newY + word.length : newY;
                        
                        if (newX >= 0 && newY >= 0 && endX <= gridSize && endY <= gridSize) {
                            // Quick check if placement is viable
                            const testGene = { ...gene, x: newX, y: newY, direction: newDirection };
                            const testGrid = grid.map(row => [...row]);
                            const testResult = this.tryPlaceWord(testGrid, testGene, placedWords);
                            
                            if (testResult.success) {
                                possiblePlacements.push({
                                    x: newX,
                                    y: newY,
                                    direction: newDirection,
                                    intersections: testResult.intersections,
                                    score: testResult.score || testResult.intersections
                                });
                            }
                        }
                    }
                }
            }
        }
        
        return possiblePlacements;
    }

    static tryPlaceWord(grid, gene, placedWords) {
        const { word, x, y, direction, clue } = gene;
        
        // Check bounds
        if (x < 0 || y < 0) return { success: false, score: 0 };
        if (direction === 'across' && x + word.length > grid[0].length) return { success: false, score: 0 };
        if (direction === 'down' && y + word.length > grid.length) return { success: false, score: 0 };
        
        // Check for conflicts and count intersections per word
        let intersections = 0;
        const cells = [];
        const intersectingWords = new Map(); // Track which words we intersect with
        
        for (let i = 0; i < word.length; i++) {
            const cellX = direction === 'across' ? x + i : x;
            const cellY = direction === 'down' ? y + i : y;
            
            cells.push({ x: cellX, y: cellY, letter: word[i] });
            
            const currentCell = grid[cellY][cellX];
            if (currentCell !== null) {
                if (currentCell === word[i]) {
                    // Find which word this intersection belongs to
                    for (const placedWord of placedWords) {
                        // Check if this cell belongs to the placed word
                        const belongsToWord = placedWord.cells.some(cell => 
                            cell.x === cellX && cell.y === cellY
                        );
                        
                        if (belongsToWord) {
                            // Check if words are parallel (same direction) - this would be overlap, not intersection
                            if (placedWord.direction === direction) {
                                // Parallel words cannot overlap at all
                                return { success: false, score: 0 };
                            }
                            
                            const wordKey = `${placedWord.wordIndex}`;
                            if (intersectingWords.has(wordKey)) {
                                // Already intersecting with this word - not allowed!
                                return { success: false, score: 0 };
                            }
                            intersectingWords.set(wordKey, true);
                            break;
                        }
                    }
                    intersections++;
                } else {
                    return { success: false, score: 0 }; // Conflict
                }
            }
        }
        
        // STRICT ADJACENCY CHECK: Prevent words from being placed adjacent to each other
        // Check all cells adjacent to the word for conflicts
        for (let i = 0; i < word.length; i++) {
            const cellX = direction === 'across' ? x + i : x;
            const cellY = direction === 'down' ? y + i : y;
            
            // Check perpendicular adjacency (sides of the word)
            if (direction === 'across') {
                // Check above and below
                for (const dy of [-1, 1]) {
                    const checkY = cellY + dy;
                    if (checkY >= 0 && checkY < grid.length && grid[checkY][cellX] !== null) {
                        // This cell is adjacent and filled - only allow if it's an intersection
                        if (grid[cellY][cellX] !== word[i]) {
                            return { success: false, score: 0 }; // Adjacent cell conflict
                        }
                    }
                }
            } else { // direction === 'down'
                // Check left and right
                for (const dx of [-1, 1]) {
                    const checkX = cellX + dx;
                    if (checkX >= 0 && checkX < grid[0].length && grid[cellY][checkX] !== null) {
                        // This cell is adjacent and filled - only allow if it's an intersection
                        if (grid[cellY][cellX] !== word[i]) {
                            return { success: false, score: 0 }; // Adjacent cell conflict
                        }
                    }
                }
            }
        }
        
        // Check cells before and after the word
        if (direction === 'across') {
            // Check cell before start
            if (x > 0 && grid[y][x - 1] !== null) {
                return { success: false, score: 0 }; // Cell before word is filled
            }
            // Check cell after end
            if (x + word.length < grid[0].length && grid[y][x + word.length] !== null) {
                return { success: false, score: 0 }; // Cell after word is filled
            }
        } else { // direction === 'down'
            // Check cell before start
            if (y > 0 && grid[y - 1][x] !== null) {
                return { success: false, score: 0 }; // Cell before word is filled
            }
            // Check cell after end
            if (y + word.length < grid.length && grid[y + word.length][x] !== null) {
                return { success: false, score: 0 }; // Cell after word is filled
            }
        }
        
        // Place the word on the grid
        for (const cell of cells) {
            grid[cell.y][cell.x] = cell.letter;
        }
        
        return {
            success: true,
            word: word,
            x: x,
            y: y,
            direction: direction,
            clue: clue,
            cells: cells,
            intersections: intersections,
            score: intersections,
            wordIndex: gene.wordIndex
        };
    }

    static createCompactGrid(placedWords, gridSize) {
        // Find actual bounds of placed words
        let minX = gridSize, maxX = 0, minY = gridSize, maxY = 0;
        
        for (const word of placedWords) {
            if (word.cells) {
                for (const cell of word.cells) {
                    minX = Math.min(minX, cell.x);
                    maxX = Math.max(maxX, cell.x);
                    minY = Math.min(minY, cell.y);
                    maxY = Math.max(maxY, cell.y);
                }
            }
        }
        
        // Create a compact grid with 1 cell padding
        const padding = 1;
        const newWidth = maxX - minX + 1 + padding * 2;
        const newHeight = maxY - minY + 1 + padding * 2;
        const compactGrid = Array(newHeight).fill(null).map(() => Array(newWidth).fill(null));
        
        // Adjust word positions and place on compact grid
        const adjustedWords = [];
        for (const word of placedWords) {
            const adjustedWord = {
                ...word,
                x: word.x - minX + padding,
                y: word.y - minY + padding,
                cells: word.cells.map(cell => ({
                    ...cell,
                    x: cell.x - minX + padding,
                    y: cell.y - minY + padding
                }))
            };
            adjustedWords.push(adjustedWord);
            
            // Place on compact grid
            for (const cell of adjustedWord.cells) {
                if (compactGrid[cell.y] && compactGrid[cell.y][cell.x] !== undefined) {
                    compactGrid[cell.y][cell.x] = cell.letter;
                }
            }
        }
        
        return {
            grid: compactGrid,
            placedWords: adjustedWords,
            gridSize: Math.max(newWidth, newHeight)
        };
    }

    static crossover(parent1, parent2) {
        const offspring = {
            genes: [],
            fitness: 0,
            gridSize: Math.random() > 0.5 ? parent1.gridSize : parent2.gridSize
        };
        
        // Create a map of word indices to ensure no duplicates
        const usedIndices = new Set();
        
        // Take random mix from both parents
        const allGenes = [...parent1.genes, ...parent2.genes];
        
        // Shuffle and take unique genes
        for (let i = allGenes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allGenes[i], allGenes[j]] = [allGenes[j], allGenes[i]];
        }
        
        for (const gene of allGenes) {
            if (!usedIndices.has(gene.wordIndex) && offspring.genes.length < parent1.genes.length) {
                offspring.genes.push({...gene});
                usedIndices.add(gene.wordIndex);
            }
        }
        
        // Ensure placement order is valid
        offspring.genes.forEach((gene, i) => {
            gene.placementOrder = i;
        });
        
        return offspring;
    }
    
    static mutate(individual, mutationRate) {
        const mutated = JSON.parse(JSON.stringify(individual));
        
        for (let i = 0; i < mutated.genes.length; i++) {
            if (Math.random() < mutationRate) {
                const gene = mutated.genes[i];
                
                // Randomly change position, direction, or placement order
                const mutationType = Math.floor(Math.random() * 4);
                
                switch (mutationType) {
                    case 0: // Change X position
                        gene.x = Math.floor(Math.random() * Math.max(1, mutated.gridSize - gene.word.length));
                        break;
                    case 1: // Change Y position
                        gene.y = Math.floor(Math.random() * Math.max(1, mutated.gridSize - gene.word.length));
                        break;
                    case 2: // Change direction
                        gene.direction = gene.direction === 'across' ? 'down' : 'across';
                        break;
                    case 3: // Swap placement order with another gene
                        if (mutated.genes.length > 1) {
                            const j = Math.floor(Math.random() * mutated.genes.length);
                            if (i !== j) {
                                const temp = mutated.genes[i].placementOrder;
                                mutated.genes[i].placementOrder = mutated.genes[j].placementOrder;
                                mutated.genes[j].placementOrder = temp;
                            }
                        }
                        break;
                }
            }
        }
        
        // Small chance to adjust grid size
        if (Math.random() < 0.1) {
            const adjustment = Math.random() > 0.5 ? 1 : -1;
            mutated.gridSize = Math.max(10, Math.min(20, mutated.gridSize + adjustment));
        }
        
        return mutated;
    }

    getGrid(individual, baseGridSize = 15) {
        const gridSize = individual.gridSize || baseGridSize;
        const grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
        const placedWords = [];
        const placedWordIndices = new Set();
        
        // Sort genes by placement order
        const sortedGenes = [...individual.genes].sort((a, b) => a.placementOrder - b.placementOrder);
        
        for (let i = 0; i < sortedGenes.length; i++) {
            const gene = sortedGenes[i];
            
            // Skip if already placed
            if (placedWordIndices.has(gene.wordIndex)) {
                continue;
            }
            
            const isFirstWord = placedWords.length === 0;
            const placement = CrosswordGrid.tryPlaceWordWithIntersection(grid, gene, placedWords, isFirstWord, gridSize);
            
            if (placement.success) {
                placedWords.push(placement);
                placedWordIndices.add(gene.wordIndex);
            }
        }
        
        // Return compact grid
        if (placedWords.length > 0) {
            return CrosswordGrid.createCompactGrid(placedWords, gridSize);
        }
        
        return { grid, placedWords };
    }
}