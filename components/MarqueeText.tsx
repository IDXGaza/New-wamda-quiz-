
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface MarqueeTextProps {
  text: string;
  className?: string;
  speed?: number;
  direction?: 'rtl' | 'ltr';
}

const MarqueeText: React.FC<MarqueeTextProps> = ({ 
  text, 
  className = '', 
  speed = 35,
  direction = 'rtl'
}) => {
  const [shouldScroll, setShouldScroll] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && measureRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const textWidth = measureRef.current.offsetWidth;
        // Scroll only if it really overflows
        const needsScroll = textWidth > containerWidth + 20;
        setContentWidth(textWidth);
        setShouldScroll(needsScroll);
      }
    };

    const observer = new ResizeObserver(checkOverflow);
    if (containerRef.current) observer.observe(containerRef.current);
    
    checkOverflow();
    const timers = [100, 500].map(ms => setTimeout(checkOverflow, ms));

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [text]);

  const gap = 50; 
  const unitWidth = contentWidth + gap;
  const duration = unitWidth / speed;

  return (
    <div 
      ref={containerRef} 
      className={`${className} relative overflow-hidden whitespace-nowrap w-full flex justify-center items-center`}
    >
      <span 
        ref={measureRef} 
        className={`${className} absolute invisible whitespace-nowrap pointer-events-none opacity-0`}
        aria-hidden="true"
        style={{ left: -9999, top: 0 }}
      >
        {text}
      </span>

      {!shouldScroll ? (
        <div className="truncate w-full text-center">
          {text}
        </div>
      ) : (
        <div className="w-full overflow-hidden flex" style={{ direction: 'ltr' }}>
          <motion.div
            key={text}
            initial={{ x: -unitWidth }}
            animate={{ x: 0 }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: duration,
            }}
            className="flex whitespace-nowrap shrink-0"
            style={{ width: 'max-content' }}
          >
            <span dir="rtl" style={{ paddingLeft: gap }}>{text}</span>
            <span dir="rtl" style={{ paddingLeft: gap }}>{text}</span>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MarqueeText;
