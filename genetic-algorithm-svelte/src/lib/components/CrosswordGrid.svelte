<script>
    let { grid = $bindable([]), placedWords = [], cellSize = 30 } = $props();
    
    function getCellNumber(x, y) {
        for (let i = 0; i < placedWords.length; i++) {
            const word = placedWords[i];
            if (word.x === x && word.y === y) {
                return i + 1;
            }
        }
        return null;
    }
    
    function getCellClass(x, y) {
        const hasLetter = grid[y] && grid[y][x] !== null && grid[y][x] !== undefined;
        return hasLetter ? 'filled' : 'empty';
    }
</script>

<div class="crossword-container">
    <svg 
        width={(grid[0]?.length || 0) * cellSize} 
        height={grid.length * cellSize}
        class="crossword-grid"
    >
        <!-- White background rectangle -->
        <rect 
            x="0" 
            y="0" 
            width={(grid[0]?.length || 0) * cellSize} 
            height={grid.length * cellSize} 
            fill="white"
        />
        {#each grid as row, y}
            {#each row as cell, x}
                <g>
                    <rect
                        x={x * cellSize}
                        y={y * cellSize}
                        width={cellSize}
                        height={cellSize}
                        class="cell {getCellClass(x, y)}"
                    />
                    {#if cell}
                        <text
                            x={x * cellSize + cellSize / 2}
                            y={y * cellSize + cellSize / 2 + 2}
                            text-anchor="middle"
                            dominant-baseline="middle"
                            class="letter"
                        >
                            {cell.toUpperCase()}
                        </text>
                    {/if}
                    {#if getCellNumber(x, y)}
                        <text
                            x={x * cellSize + 3}
                            y={y * cellSize + 10}
                            class="number"
                        >
                            {getCellNumber(x, y)}
                        </text>
                    {/if}
                </g>
            {/each}
        {/each}
    </svg>
    
    <div class="clues">
        <div class="clues-section">
            <h3>Across</h3>
            {#each placedWords.filter(w => w.direction === 'across') as word, i}
                <div class="clue">
                    <strong>{placedWords.indexOf(word) + 1}.</strong> {word.clue}
                </div>
            {/each}
        </div>
        
        <div class="clues-section">
            <h3>Down</h3>
            {#each placedWords.filter(w => w.direction === 'down') as word, i}
                <div class="clue">
                    <strong>{placedWords.indexOf(word) + 1}.</strong> {word.clue}
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .crossword-container {
        display: flex;
        gap: 2rem;
        padding: 0;
        overflow: visible;
        width: fit-content;
        margin: 0 auto;
    }
    
    .crossword-grid {
        border: 2px solid #333;
        background: white;
        flex-shrink: 0;
    }
    
    .cell {
        stroke: #333;
        stroke-width: 1;
    }
    
    .cell.filled {
        fill: white;
    }
    
    .cell.empty {
        fill: #333;
    }
    
    .letter {
        font-size: 18px;
        font-weight: bold;
        fill: #333;
        font-family: Arial, sans-serif;
    }
    
    .number {
        font-size: 10px;
        fill: #333;
        font-weight: bold;
    }
    
    .clues {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        min-width: 250px;
        max-width: 350px;
        color: #2c3e50;
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
    }
    
    .clues-section h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.2rem;
        color: #2c3e50;
    }
    
    .clue {
        margin: 0.25rem 0;
        font-size: 0.9rem;
        color: #2c3e50;
    }
</style>