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

---

### `freeform_qa`
Stores free-form questions and answers that are not part of the pre-generated suggestions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | `GENERATED ALWAYS AS IDENTITY` | Unique identifier for the Q&A record |
| `project_id` | TEXT | NO | - | Project identifier |
| `article_unique_id` | TEXT | NO | - | Reference to article unique_id |
| `visitor_id` | UUID | YES | - | Visitor identifier for analytics |
| `session_id` | UUID | YES | - | Session identifier for analytics |
| `question` | TEXT | NO | - | User's free-form question |
| `answer` | TEXT | YES | - | AI-generated answer |
| `created_at` | TIMESTAMPTZ | YES | `NOW()` | Timestamp when question was asked |
| `updated_at` | TIMESTAMPTZ | YES | `NOW()` | Timestamp when answer was saved |

**Indexes:**
- `idx_freeform_qa_project_id` on `project_id` - For filtering by project
- `idx_freeform_qa_article_unique_id` on `article_unique_id` - For filtering by article
- `idx_freeform_qa_visitor_id` on `visitor_id` - For visitor analytics
- `idx_freeform_qa_session_id` on `session_id` - For session analytics
- `idx_freeform_qa_created_at` on `created_at DESC` - For chronological queries

**Constraints:**
- Primary Key: `id`
- Foreign Key: `article_unique_id` references `article(unique_id)` ON DELETE CASCADE

**Row Level Security (RLS):**
- ✅ Enabled
- **Policies:**
  - Allow all operations (configured for service role access through Edge Functions)

---

## Future Enhancements

Potential fields to add:
- `icon_url` TEXT - Client logo/icon URL
- `direction` VARCHAR(3) - Text direction ('ltr' or 'rtl')
- `language` VARCHAR(5) - Language code (e.g., 'en', 'he')
- `show_ad` BOOLEAN - Whether to show advertisement slot
- `input_placeholders` JSONB - Array of placeholder texts
- `theme` JSONB - Extended theme configuration
- `features` JSONB - Feature flags and settings
