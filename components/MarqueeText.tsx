
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
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && measureRef.current) {
        // Use getBoundingClientRect for absolute pixel precision
        const cWidth = containerRef.current.getBoundingClientRect().width;
        const tWidth = measureRef.current.getBoundingClientRect().width;
        
        if (cWidth > 0 && tWidth > 0) {
          // A tiny tolerance of 5px to avoid unnecessary scrolling for fits-almost-perfectly
          const needsScroll = tWidth > cWidth + 5;
          setContentWidth(tWidth);
          setContainerWidth(cWidth);
          setShouldScroll(needsScroll);
        }
      }
    };

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    // Check initially and schedule multiple checks to catch post-render layout settling/font loading
    checkOverflow();
    const timers = [50, 150, 300, 600, 1200, 2000].map(ms => 
      setTimeout(checkOverflow, ms)
    );

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [text]);

  const gap = 60; 
  const unitWidth = contentWidth + gap;
  const duration = unitWidth / speed;

  return (
    <div 
      ref={containerRef} 
      className="relative overflow-hidden whitespace-nowrap w-full"
    >
      {/* Off-screen high-precision layout measurer */}
      <span 
        ref={measureRef} 
        className={`${className} absolute invisible whitespace-nowrap pointer-events-none opacity-0`}
        aria-hidden="true"
        style={{ left: -9999, top: 0 }}
      >
        {text}
      </span>

      {!shouldScroll ? (
        <div className={`${className} truncate w-full text-center`}>
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
              duration: duration > 0 ? duration : 10,
            }}
            className="flex whitespace-nowrap shrink-0"
            style={{ width: 'max-content' }}
          >
            <span dir="rtl" className={className} style={{ paddingLeft: gap }}>{text}</span>
            <span dir="rtl" className={className} style={{ paddingLeft: gap }}>{text}</span>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MarqueeText;
