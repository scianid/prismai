# Database Schema

## Tables

### `project`
Stores widget configuration for each client project.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `gen_random_uuid()` | Unique identifier for the project record |
| `widget_id` | VARCHAR(255) | NO | - | Client-facing widget identifier used in embed code (unique) |
| `position` | VARCHAR(50) | YES | `'bottom-right'` | Widget position on page |
| `primary_color` | VARCHAR(7) | YES | `'#007bff'` | Primary brand color in hex format |
| `button_text` | VARCHAR(100) | YES | `'Chat with us'` | Text displayed on the widget button |
| `greeting_message` | TEXT | YES | `'Hello! How can we help you today?'` | Initial greeting message shown to users |
| `api_endpoint` | TEXT | YES | - | Custom API endpoint for this project |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Timestamp when the project was created |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Timestamp when the project was last updated |

**Indexes:**
- `idx_project_widget_id` on `widget_id` - For fast widget config lookups

**Constraints:**
- Primary Key: `id`
- Unique: `widget_id`

**Row Level Security (RLS):**
- ✅ Enabled
- **Policies:**
  - ❌ No direct access policies - all database access must go through Edge Functions
  - Edge Functions use `service_role` which bypasses RLS for secure server-side operations

**Triggers:**
- `update_project_updated_at` - Automatically updates `updated_at` timestamp on record modification

## Future Enhancements

Potential fields to add:
- `icon_url` TEXT - Client logo/icon URL
- `direction` VARCHAR(3) - Text direction ('ltr' or 'rtl')
- `language` VARCHAR(5) - Language code (e.g., 'en', 'he')
- `show_ad` BOOLEAN - Whether to show advertisement slot
- `input_placeholders` JSONB - Array of placeholder texts
- `theme` JSONB - Extended theme configuration
- `features` JSONB - Feature flags and settings
