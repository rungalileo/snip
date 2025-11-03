import { useState, useEffect } from 'react';
import { api } from '../api';

const ownerCache = new Map<string, string>();

export const useOwnerName = (ownerId: string | undefined): string => {
  const [ownerName, setOwnerName] = useState<string>('Unassigned');

  useEffect(() => {
    if (!ownerId) {
      setOwnerName('Unassigned');
      return;
    }

    // Check cache first
    if (ownerCache.has(ownerId)) {
      setOwnerName(ownerCache.get(ownerId)!);
      return;
    }

    // Fetch from API
    const fetchOwner = async () => {
      try {
        const member = await api.getMember(ownerId);
        const name = member.profile?.name || 'Unknown';
        ownerCache.set(ownerId, name);
        setOwnerName(name);
      } catch (error) {
        console.error('Error fetching owner:', error);
        setOwnerName('Unknown');
      }
    };

    fetchOwner();
  }, [ownerId]);

  return ownerName;
};
