import { describe, it, expect } from 'vitest';
import { AUTO_PARTS_TAXONOMY, allCategorySlugs, CategoryNode } from './categoryTaxonomy';

describe('auto-parts category taxonomy', () => {
  it('has globally unique slugs across the whole tree', () => {
    // A duplicate slug would make the seed's slug-keyed upsert silently
    // collide two different categories onto one row.
    const slugs = allCategorySlugs();
    const duplicates = slugs.filter((slug, i) => slugs.indexOf(slug) !== i);
    expect(duplicates).toEqual([]);
  });

  it('uses url-safe kebab-case slugs', () => {
    for (const slug of allCategorySlugs()) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every node a name and an icon', () => {
    const walk = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        expect(node.name.length).toBeGreaterThan(0);
        expect(node.icon.length).toBeGreaterThan(0);
        walk(node.children ?? []);
      }
    };
    walk(AUTO_PARTS_TAXONOMY);
  });

  it('leads with engines & drivetrain (the vertical spine)', () => {
    expect(AUTO_PARTS_TAXONOMY[0].slug).toBe('engines-drivetrain');
  });
});
