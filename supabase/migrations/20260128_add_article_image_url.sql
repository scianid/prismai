-- Add image_url column to article table for featured/social share images

ALTER TABLE article 
ADD COLUMN image_url TEXT;

COMMENT ON COLUMN article.image_url IS 'Featured image URL extracted from og:image meta tag or article content';

-- Index for efficient image lookups
CREATE INDEX idx_article_image_url ON article(image_url) WHERE image_url IS NOT NULL;
