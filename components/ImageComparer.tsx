
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CompareArrowsIcon } from './Icons.tsx';

interface ImageComparerProps {
  originalSrc: string;
  processedSrc: string;
  processedAltText?: string;
}

const ImageComparer: React.FC<ImageComparerProps> = ({ originalSrc, processedSrc, processedAltText = "Processed Version" }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
  };

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    handleMove(e.clientX);
  }, [isDragging, handleMove]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  }, [isDragging, handleMove]);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.getBoundingClientRect().width;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    };

    // Delay the initial width measurement to prevent a race condition
    // where we try to read the size before the browser has finished layout.
    const timerId = setTimeout(updateWidth, 0);
    window.addEventListener('resize', updateWidth);

    return () => {
      clearTimeout(timerId);
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isDragging, handleMouseMove, handleTouchMove, handleMouseUp]);


  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-ew-resize select-none overflow-hidden rounded-md group"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Processed (bottom) image */}
      <img
        src={processedSrc}
        alt={processedAltText}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
      
      {/* Original (top, clipped) image */}
      <div
        className="absolute inset-0 h-full overflow-hidden pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={originalSrc}
          alt="Original Version"
          className="absolute inset-0 h-full object-contain pointer-events-none"
          style={{ width: containerWidth > 0 ? containerWidth : '100%' }}
          draggable={false}
        />
      </div>

      {/* Slider Handle */}
      <div
        className="absolute top-0 h-full w-1 bg-sky-400/70 pointer-events-none transform -translate-x-1/2 transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-sky-400/50"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-slate-900 border-4 border-sky-400 shadow-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
          <CompareArrowsIcon className="w-5 h-5 text-sky-400" />
        </div>
      </div>
    </div>
  );
};

export default ImageComparer;