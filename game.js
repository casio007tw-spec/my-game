/**
 * 2048 益智遊戲 - 核心程式邏輯 (game.js)
 * 包含：4x4 二維矩陣運算、方向變換、滑動合併演算法、狀態管理、手勢與按鍵監聽
 */

class Game2048 {
  constructor(size = 4) {
    this.size = size;
    this.board = [];
    this.score = 0;
    this.bestScore = parseInt(localStorage.getItem('2048_best_score') || '0', 10);
    this.isOver = false;
    this.isWon = false;
    this.keepPlaying = false;
    this.previousState = null; // 用於「復原 (Undo)」功能

    // 記錄本次移動中新生成與合併的方塊座標，用於觸發動畫
    this.newTileCoord = null;
    this.mergedCoords = [];

    // DOM 節點快取
    this.tileContainer = document.getElementById('tile-container');
    this.currentScoreEl = document.getElementById('current-score');
    this.bestScoreEl = document.getElementById('best-score');
    this.scoreAdditionEl = document.getElementById('score-addition');
    this.overlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlayMessage = document.getElementById('overlay-message');
    this.overlayActionBtn = document.getElementById('overlay-action-btn');
    this.overlayContinueBtn = document.getElementById('overlay-continue-btn');
    this.undoBtn = document.getElementById('undo-btn');
    this.restartBtn = document.getElementById('restart-btn');

    this.init();
  }

  /**
   * 初始化遊戲環境與事件監聽
   */
  init() {
    this.bestScoreEl.textContent = this.bestScore;
    this.bindEvents();
    this.startNewGame();
  }

  /**
   * 開啟一局全新遊戲
   */
  startNewGame() {
    // 建立 4x4 空矩陣 (填 0)
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));
    this.score = 0;
    this.isOver = false;
    this.isWon = false;
    this.keepPlaying = false;
    this.previousState = null;
    this.newTileCoord = null;
    this.mergedCoords = [];

    this.hideOverlay();
    this.updateUndoButton();

    // 初始隨機生成 2 個方塊
    this.addRandomTile();
    this.addRandomTile();

    this.render();
  }

  /**
   * 在隨機空白處生成一個數字方塊 (90% 機率為 2，10% 機率為 4)
   */
  addRandomTile() {
    const emptyCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }

    if (emptyCells.length === 0) return null;

    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    this.board[randomCell.r][randomCell.c] = value;
    this.newTileCoord = { r: randomCell.r, c: randomCell.c };
    return this.newTileCoord;
  }

  // ==========================================================
  // 核心演算法：二維陣列 (矩陣) 滑動、合併與方向變換
  // ==========================================================

  /**
   * 針對單一列 (1D Array) 進行向左壓縮與合併
   * 例：[2, 0, 2, 4] -> [4, 4, 0, 0]
   * @param {number[]} row
   * @returns {{ newRow: number[], scoreGained: number, mergedIndices: number[] }}
   */
  slideAndMergeRow(row) {
    // 1. 去除所有 0 (壓縮)
    const filtered = row.filter(val => val !== 0);
    const newRow = [];
    const mergedIndices = [];
    let scoreGained = 0;

    let i = 0;
    while (i < filtered.length) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        // 相鄰兩數相同，合併為兩倍
        const mergedVal = filtered[i] * 2;
        newRow.push(mergedVal);
        scoreGained += mergedVal;
        mergedIndices.push(newRow.length - 1); // 記錄被合併的新位置
        i += 2; // 跳過已合併的下一個元素
      } else {
        newRow.push(filtered[i]);
        i += 1;
      }
    }

    // 補齊剩餘的 0
    while (newRow.length < this.size) {
      newRow.push(0);
    }

    return { newRow, scoreGained, mergedIndices };
  }

  /**
   * 矩陣旋轉/變換輔助工具
   */
  // 矩陣轉置 (對角線翻轉：行變列、列變行)
  transpose(matrix) {
    return matrix[0].map((_, colIdx) => matrix.map(row => row[colIdx]));
  }

  // 矩陣水平翻轉 (每一列反轉)
  reverseRows(matrix) {
    return matrix.map(row => [...row].reverse());
  }

  /**
   * 複製二維陣列
   */
  cloneBoard(board) {
    return board.map(row => [...row]);
  }

  /**
   * 判斷兩個二維矩陣內容是否完全相同
   */
  isBoardEqual(b1, b2) {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (b1[r][c] !== b2[r][c]) return false;
      }
    }
    return true;
  }

  /**
   * 處理四個方向的移動 (0: 上, 1: 右, 2: 下, 3: 左)
   * 透過數學變換將所有方向簡化為「向左滑動」：
   * - Left:   直接向左滑動
   * - Right:  水平翻轉 -> 向左滑動 -> 水平翻轉復原
   * - Up:     矩陣轉置 -> 向左滑動 -> 矩陣轉置復原
   * - Down:   轉置 + 翻轉 -> 向左滑動 -> 翻轉 + 轉置復原
   */
  move(direction) {
    if (this.isOver) return false;

    // 備份當前狀態，用於判斷是否移動成功與支援 Undo
    const previousBoard = this.cloneBoard(this.board);
    const previousScore = this.score;

    let tempBoard = this.cloneBoard(this.board);
    let totalScoreGained = 0;
    this.mergedCoords = [];

    // 步驟 1：根據方向旋轉/轉換為「向左」視角
    if (direction === 0) {
      // UP: 轉置
      tempBoard = this.transpose(tempBoard);
    } else if (direction === 1) {
      // RIGHT: 水平翻轉
      tempBoard = this.reverseRows(tempBoard);
    } else if (direction === 2) {
      // DOWN: 轉置後翻轉
      tempBoard = this.reverseRows(this.transpose(tempBoard));
    }

    // 步驟 2：每一列執行向左壓縮與合併
    const mergedGrid = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    for (let r = 0; r < this.size; r++) {
      const { newRow, scoreGained, mergedIndices } = this.slideAndMergeRow(tempBoard[r]);
      tempBoard[r] = newRow;
      totalScoreGained += scoreGained;
      mergedIndices.forEach(c => {
        mergedGrid[r][c] = true;
      });
    }

    // 步驟 3：反向轉換回原方向視角
    if (direction === 0) {
      // UP 復原：轉置
      tempBoard = this.transpose(tempBoard);
      this.collectMergedCoords(this.transpose(mergedGrid));
    } else if (direction === 1) {
      // RIGHT 復原：翻轉
      tempBoard = this.reverseRows(tempBoard);
      this.collectMergedCoords(this.reverseRows(mergedGrid));
    } else if (direction === 2) {
      // DOWN 復原：翻轉後轉置
      tempBoard = this.transpose(this.reverseRows(tempBoard));
      this.collectMergedCoords(this.transpose(this.reverseRows(mergedGrid)));
    } else {
      this.collectMergedCoords(mergedGrid);
    }

    // 判斷棋盤是否有任何改變（無效移動則不產生新方塊）
    if (this.isBoardEqual(this.board, tempBoard)) {
      return false;
    }

    // 保存上一步紀錄供 Undo 使用
    this.previousState = {
      board: previousBoard,
      score: previousScore
    };
    this.updateUndoButton();

    // 更新棋盤與分數
    this.board = tempBoard;
    this.score += totalScoreGained;

    // 檢查是否有浮動加分特效
    if (totalScoreGained > 0) {
      this.triggerScoreAddition(totalScoreGained);
    }

    // 檢查歷史最高分
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('2048_best_score', this.bestScore.toString());
      this.bestScoreEl.textContent = this.bestScore;
    }

    // 產生一個新的隨機方塊
    this.addRandomTile();

    // 檢查遊戲勝負狀態
    this.checkGameStatus();

    // 重新渲染畫面
    this.render();
    return true;
  }

  collectMergedCoords(grid) {
    this.mergedCoords = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c]) {
          this.mergedCoords.push({ r, c });
        }
      }
    }
  }

  /**
   * 檢查是否有任何有效步數 (判斷是否 Game Over)
   */
  canMove() {
    // 1. 若有空格，必定可走
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0) return true;
      }
    }

    // 2. 檢查水平相鄰是否有相同數字
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size - 1; c++) {
        if (this.board[r][c] === this.board[r][c + 1]) return true;
      }
    }

    // 3. 檢查垂直相鄰是否有相同數字
    for (let c = 0; c < this.size; c++) {
      for (let r = 0; r < this.size - 1; r++) {
        if (this.board[r][c] === this.board[r + 1][c]) return true;
      }
    }

    return false;
  }

  /**
   * 檢查獲勝條件 (達成 2048) 與失敗條件 (無路可走)
   */
  checkGameStatus() {
    // 檢查是否首次合成 2048
    if (!this.isWon && !this.keepPlaying) {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.board[r][c] === 2048) {
            this.isWon = true;
            this.showOverlay('你贏了！🎉', '成功達成 2048 方塊！', true);
            return;
          }
        }
      }
    }

    // 檢查是否無路可走
    if (!this.canMove()) {
      this.isOver = true;
      this.showOverlay('遊戲結束！', '沒有任何可移動的步驟了', false);
    }
  }

  /**
   * 復原功能 (Undo)
   */
  undo() {
    if (!this.previousState) return;

    this.board = this.cloneBoard(this.previousState.board);
    this.score = this.previousState.score;
    this.isOver = false;
    this.previousState = null; // 僅支援復原一步

    this.hideOverlay();
    this.updateUndoButton();
    this.render();
  }

  updateUndoButton() {
    this.undoBtn.disabled = !this.previousState;
  }

  // ==========================================================
  // UI 渲染與視覺回饋
  // ==========================================================

  render() {
    this.currentScoreEl.textContent = this.score;
    this.bestScoreEl.textContent = this.bestScore;

    // 清空現有方塊
    this.tileContainer.innerHTML = '';

    // 動態依座標生成方塊
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const val = this.board[r][c];
        if (val === 0) continue;

        const tile = document.createElement('div');
        tile.className = 'tile';
        
        // 數字配色 class
        if (val <= 2048) {
          tile.classList.add(`tile-${val}`);
        } else {
          tile.classList.add('tile-super');
        }

        // 動畫 class (新生成 / 合併)
        if (this.newTileCoord && this.newTileCoord.r === r && this.newTileCoord.c === c) {
          tile.classList.add('tile-new');
        }
        if (this.mergedCoords.some(coord => coord.r === r && coord.c === c)) {
          tile.classList.add('tile-merged');
        }

        // CSS Grid 定位 (1-based index)
        tile.style.gridRowStart = r + 1;
        tile.style.gridColumnStart = c + 1;
        tile.textContent = val;

        this.tileContainer.appendChild(tile);
      }
    }

    // 重設動畫旗標
    this.newTileCoord = null;
    this.mergedCoords = [];
  }

  triggerScoreAddition(score) {
    this.scoreAdditionEl.textContent = `+${score}`;
    this.scoreAdditionEl.classList.remove('active');
    // 強制重繪以重播 CSS 動畫
    void this.scoreAdditionEl.offsetWidth;
    this.scoreAdditionEl.classList.add('active');
  }

  showOverlay(title, message, canContinue) {
    this.overlayTitle.textContent = title;
    this.overlayMessage.textContent = message;
    this.overlayContinueBtn.style.display = canContinue ? 'inline-block' : 'none';
    this.overlay.classList.add('active');
  }

  hideOverlay() {
    this.overlay.classList.remove('active');
  }

  // ==========================================================
  // 鍵盤與觸控事件監聽
  // ==========================================================

  bindEvents() {
    // 1. 鍵盤事件 (WASD 與方向鍵)
    window.addEventListener('keydown', (e) => {
      // 若在輸入框內則不攔截
      if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

      let handled = false;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          handled = this.move(0); // Up
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          handled = this.move(1); // Right
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          handled = this.move(2); // Down
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          handled = this.move(3); // Left
          break;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); // 防止滾動瀏覽器頁面
      }
    });

    // 2. 觸控滑動手勢 (適用手機與平板)
    let touchStartX = 0;
    let touchStartY = 0;

    const gameContainer = document.getElementById('game-container');

    gameContainer.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) return; // 忽略多指觸控
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    gameContainer.addEventListener('touchend', (e) => {
      if (!touchStartX || !touchStartY) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const threshold = 35; // 滑動最小觸發距離 (px)

      if (Math.max(absDx, absDy) > threshold) {
        if (absDx > absDy) {
          // 水平滑動
          if (dx > 0) {
            this.move(1); // Right
          } else {
            this.move(3); // Left
          }
        } else {
          // 垂直滑動
          if (dy > 0) {
            this.move(2); // Down
          } else {
            this.move(0); // Up
          }
        }
      }

      touchStartX = 0;
      touchStartY = 0;
    }, { passive: true });

    // 3. 按鈕事件綁定
    this.restartBtn.addEventListener('click', () => this.startNewGame());
    this.undoBtn.addEventListener('click', () => this.undo());
    this.overlayActionBtn.addEventListener('click', () => this.startNewGame());
    this.overlayContinueBtn.addEventListener('click', () => {
      this.keepPlaying = true;
      this.hideOverlay();
    });
  }
}

// 頁面載入完成後啟動遊戲
document.addEventListener('DOMContentLoaded', () => {
  window.game = new Game2048(4);
});
