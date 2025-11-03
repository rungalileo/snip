import { Story } from '../types';

export const getPriority = (story: Story): string => {
  if (!story.custom_fields || story.custom_fields.length === 0) {
    return '—';
  }

  // Look for the priority custom field
  // The field might be named "Priority" or have a specific field_id
  const priorityField = story.custom_fields.find((field) => {
    // You may need to adjust this logic based on your Shortcut workspace
    // For now, we'll return the first custom field value that exists
    return field.value !== undefined && field.value !== null && field.value !== '';
  });

  return priorityField?.value || '—';
};
