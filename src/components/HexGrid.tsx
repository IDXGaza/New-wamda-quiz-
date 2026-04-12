import React from 'react';
import { motion } from 'framer-motion';
import { CartoonSnowflake, CartoonShield, CartoonGhost } from './CartoonIcons';
import { Question, Player, PowerType } from '../types';

interface HexGridProps {
  grid: Question[][];
  players: Player[];
  currentPlayerIndex: number;
  answeredMap: Record<string, string>;
  winningPath: string[];
  frozenCells: Record<string, number>;
  shieldedCells: Record<string, boolean>;
  stolenCells: Record<string, boolean>;
  handleHexClick: (q: Question) => void;
}

const HexGrid: React.FC<HexGridProps> = ({
  grid,
  players,
  currentPlayerIndex,
  answeredMap,
  winningPath,
  frozenCells,
  shieldedCells,
  stolenCells,
  handleHexClick,
}) => {
  const hexWidth = 104;
  const hexHeight = 120;
  const hexHorizontalSpacing = 102; 
  const hexVerticalSpacing = 88;    

  // Calculate viewBox based on grid dimensions + borders
  const rowSizes = [6, 5, 6, 5, 6];
  const maxCols = 6;
  const viewBoxWidth = (maxCols + 1) * hexHorizontalSpacing;
  const viewBoxHeight = (rowSizes.length + 1) * hexVerticalSpacing + 40;

  const points = "52,0 104,30 104,90 52,120 0,90 0,30";

  return (
    <div className="relative w-full max-w-[min(90vw,800px)] mx-auto overflow-visible">
      <svg 
        viewBox={`-80 -100 ${viewBoxWidth + 160} ${viewBoxHeight + 180}`} 
        className="w-full h-auto hex-svg-container drop-shadow-2xl overflow-visible"
      >
        <defs>
          <filter id="scribble-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" />
          </filter>
        </defs>

        {/* --- Goal Borders (Connected Hexes) --- */}
        
        {/* Top Border (Green - Player 1) */}
        {Array.from({ length: 7 }).map((_, i) => (
          <g key={`top-${i}`} transform={`translate(${(i - 1) * hexHorizontalSpacing + 51}, ${-88})`}>
            <polygon 
              points={points} 
              className={`goal-hex ${currentPlayerIndex === 1 ? 'animate-pulse' : ''}`}
              style={{ 
                fill: players[1].color, 
                stroke: players[1].color, 
                strokeWidth: currentPlayerIndex === 1 ? 8 : 4,
                strokeLinejoin: 'round'
              }} 
            />
          </g>
        ))}

        {/* Bottom Border (Green - Player 1) */}
        {Array.from({ length: 7 }).map((_, i) => (
          <g key={`bottom-${i}`} transform={`translate(${(i - 1) * hexHorizontalSpacing + 51}, ${5 * 88})`}>
            <polygon 
              points={points} 
              className={`goal-hex ${currentPlayerIndex === 1 ? 'animate-pulse' : ''}`}
              style={{ 
                fill: players[1].color, 
                stroke: players[1].color, 
                strokeWidth: currentPlayerIndex === 1 ? 8 : 4,
                strokeLinejoin: 'round'
              }} 
            />
          </g>
        ))}

        {/* Left Border (Red - Player 0) */}
        {rowSizes.map((_, rIdx) => {
          const xOffset = (rIdx % 2 === 1) ? 51 : 0;
          return (
            <g key={`left-${rIdx}`} transform={`translate(${-102 + xOffset}, ${rIdx * 88})`}>
              <polygon 
                points={points} 
                className={`goal-hex ${currentPlayerIndex === 0 ? 'animate-pulse' : ''}`}
                style={{ 
                  fill: players[0].color, 
                  stroke: players[0].color, 
                  strokeWidth: currentPlayerIndex === 0 ? 8 : 4,
                  strokeLinejoin: 'round'
                }} 
              />
            </g>
          );
        })}

        {/* Right Border (Red - Player 0) */}
        {rowSizes.map((size, rIdx) => {
          const xOffset = (rIdx % 2 === 1) ? 51 : 0;
          return (
            <g key={`right-${rIdx}`} transform={`translate(${size * hexHorizontalSpacing + xOffset}, ${rIdx * 88})`}>
              <polygon 
                points={points} 
                className={`goal-hex ${currentPlayerIndex === 0 ? 'animate-pulse' : ''}`}
                style={{ 
                  fill: players[0].color, 
                  stroke: players[0].color, 
                  strokeWidth: currentPlayerIndex === 0 ? 8 : 4,
                  strokeLinejoin: 'round'
                }} 
              />
            </g>
          );
        })}

        {/* --- Main Grid --- */}
        {grid.map((row, rIdx) => {
          const isOddRow = rIdx % 2 === 1;
          const xOffset = isOddRow ? hexHorizontalSpacing / 2 : 0;
          const y = rIdx * hexVerticalSpacing;

          return row.map((q, cIdx) => {
            const x = cIdx * hexHorizontalSpacing + xOffset;
            const color = answeredMap[q.id];
            
            const isPlayer0 = color?.toLowerCase() === players[0]?.color.toLowerCase();
            const isPlayer1 = color?.toLowerCase() === players[1]?.color.toLowerCase();
            const isSkipped = color === '#475569';
            const activeClass = isSkipped ? 'opacity-40 grayscale' : '';
            const isWinning = winningPath.includes(q.id);
            
            let polygonStyle: React.CSSProperties = { 
              fill: '#FFFFFF', 
              stroke: '#000000', 
              strokeWidth: 4 
            };

            if (isPlayer0) {
              polygonStyle = { fill: players[0].color, stroke: '#000000', strokeWidth: 4 };
            } else if (isPlayer1) {
              polygonStyle = { fill: players[1].color, stroke: '#000000', strokeWidth: 4 };
            }

            return (
              <g key={q.id} transform={`translate(${x}, ${y})`}>
                <motion.g 
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (rIdx * 0.1) + (cIdx * 0.05), type: 'spring' }}
                  className={`hex-group ${activeClass} ${isWinning ? 'animate-win-pulse' : ''} cursor-pointer transition-all duration-300`}
                  onClick={() => handleHexClick(q)}
                  style={{ transformOrigin: '52px 60px' }}
                >
                  <polygon 
                    points={points} 
                    className={`hex-polygon transition-all duration-300 ${frozenCells[q.id] > 0 ? 'stroke-blue-400 stroke-[14px]' : ''} ${shieldedCells[q.id] ? 'stroke-emerald-400 stroke-[14px]' : ''} ${stolenCells[q.id] ? 'stroke-purple-400 stroke-[14px]' : ''}`} 
                    style={{
                      ...polygonStyle,
                      fill: frozenCells[q.id] > 0 ? `${polygonStyle.fill}88` : polygonStyle.fill,
                      filter: (frozenCells[q.id] > 0 || shieldedCells[q.id] || stolenCells[q.id]) ? 'drop-shadow(0 0 16px currentColor)' : 'none'
                    }} 
                  />
                  
                  {/* Bubbly Letter Styling */}
                  <g transform="translate(52, 60)">
                    <text 
                      className="font-display text-6xl select-none"
                      style={{ 
                        fill: '#000000', 
                        opacity: 0.3,
                        transform: 'translate(3px, 3px)'
                      }} 
                      dominantBaseline="middle" 
                      textAnchor="middle"
                    >
                      {q.letter}
                    </text>
                    <text 
                      className="font-display text-6xl select-none"
                      style={{ 
                        fill: isPlayer0 || isPlayer1 ? '#FFFFFF' : '#6B46C1',
                        stroke: '#FFFFFF',
                        strokeWidth: 2,
                        paintOrder: 'stroke'
                      }} 
                      dominantBaseline="middle" 
                      textAnchor="middle"
                    >
                      {q.letter}
                    </text>
                  </g>
                  
                  {frozenCells[q.id] > 0 && (
                    <motion.g animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
                      <foreignObject x="12" y="20" width="80" height="80">
                        <div className="flex items-center justify-center w-full h-full">
                          <CartoonSnowflake className="w-16 h-16 text-blue-400 drop-shadow-[0_0_12px_rgba(96,165,250,0.9)]" />
                        </div>
                      </foreignObject>
                    </motion.g>
                  )}
                  {shieldedCells[q.id] && (
                    <motion.g animate={{ y: [0, -8, 0], scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                      <foreignObject x="12" y="20" width="80" height="80">
                        <div className="flex items-center justify-center w-full h-full">
                          <CartoonShield className="w-16 h-16 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.9)]" />
                        </div>
                      </foreignObject>
                    </motion.g>
                  )}
                  {stolenCells[q.id] && (
                    <motion.g animate={{ opacity: [0.6, 1, 0.6], scale: [0.9, 1, 0.9] }} transition={{ duration: 3, repeat: Infinity }}>
                      <foreignObject x="12" y="20" width="80" height="80">
                        <div className="flex items-center justify-center w-full h-full">
                          <CartoonGhost className="w-16 h-16 text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.9)]" />
                        </div>
                      </foreignObject>
                    </motion.g>
                  )}
                </motion.g>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
};

export default HexGrid;
