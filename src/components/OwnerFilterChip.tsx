import React, { useState } from 'react';
import { useOwnerName } from '../hooks/useOwnerName';
import { getFirstName } from '../utils/nameUtils';
import './OwnerFilterChip.css';

interface OwnerFilterChipProps {
  ownerId: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}

export const OwnerFilterChip: React.FC<OwnerFilterChipProps> = ({
  ownerId,
  count,
  isSelected,
  onClick,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const ownerName = useOwnerName(ownerId === 'unassigned' ? undefined : ownerId);
  const firstName = getFirstName(ownerName);

  return (
    <div
      className="owner-chip-wrapper"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        className={`owner-filter-chip-compact ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
      >
        <span className="owner-firstname">{firstName}</span>
        <span className="story-count-compact">({count})</span>
      </button>
      {showTooltip && (
        <div className="owner-tooltip">
          {ownerName}
        </div>
      )}
    </div>
  );
};
