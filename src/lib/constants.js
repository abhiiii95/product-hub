// Shared, non-secret constants. Safe to import from client and server code.

export const ROLES = {
  ADMIN: 'admin',
  LISTING_USER: 'listing_user',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  listing_user: 'Listing User',
};

export const PRODUCT_STATUSES = ['active', 'inactive'];

export const LISTING_STATUSES = ['not_started', 'in_progress', 'listed', 'needs_changes'];

export const LISTING_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  listed: 'Listed',
  needs_changes: 'Needs Changes',
};

export const FIELD_TYPES = ['text', 'number', 'dropdown', 'checkbox', 'date', 'textarea'];

export const FIELD_TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  date: 'Date',
  textarea: 'Multiline text',
};

export const DEFAULT_MARKETPLACE = 'meesho';

export const DIMENSION_UNITS = ['cm', 'inch'];

export const STOCK_MOVEMENT_TYPES = ['initial', 'add', 'remove', 'set'];

export const STOCK_MOVEMENT_LABELS = {
  initial: 'Initial stock',
  add: 'Stock added',
  remove: 'Stock reduced',
  set: 'Stock count corrected',
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
