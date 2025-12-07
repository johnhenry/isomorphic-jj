/**
 * Markdown Merge Driver
 * Smart merging of markdown files by sections
 */

export class MarkdownMergeDriver {
  constructor() {
    this.name = 'markdown';
  }

  /**
   * Parse markdown into sections
   */
  parseSections(content) {
    const lines = content.split('\n');
    const sections = [];
    let currentSection = { heading: '', content: [], lineStart: 0 };

    lines.forEach((line, i) => {
      if (line.startsWith('#')) {
        if (currentSection.content.length > 0) {
          sections.push(currentSection);
        }
        currentSection = {
          heading: line,
          content: [],
          lineStart: i
        };
      } else {
        currentSection.content.push(line);
      }
    });

    if (currentSection.content.length > 0 || currentSection.heading) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Check if we can merge
   */
  canMerge(base, ours, theirs) {
    try {
      const baseSections = this.parseSections(base);
      const ourSections = this.parseSections(ours);
      const theirSections = this.parseSections(theirs);

      // Can merge if no overlapping section edits
      return !this.hasConflictingSections(baseSections, ourSections, theirSections);
    } catch (err) {
      return false; // If parsing fails, can't auto-merge
    }
  }

  /**
   * Check for conflicting section edits
   */
  hasConflictingSections(base, ours, theirs) {
    const baseHeadings = new Set(base.map(s => s.heading));
    const ourHeadings = new Set(ours.map(s => s.heading));
    const theirHeadings = new Set(theirs.map(s => s.heading));

    // Find sections edited in both ours and theirs
    for (const section of ours) {
      if (!baseHeadings.has(section.heading)) continue; // New section, no conflict

      const baseSection = base.find(s => s.heading === section.heading);
      const theirSection = theirs.find(s => s.heading === section.heading);

      if (!theirSection) continue; // Only we edited it

      // Both edited same section - check if different
      const baseContent = baseSection.content.join('\n');
      const ourContent = section.content.join('\n');
      const theirContent = theirSection.content.join('\n');

      if (ourContent !== baseContent && theirContent !== baseContent && ourContent !== theirContent) {
        return true; // Conflicting edits to same section
      }
    }

    return false;
  }

  /**
   * Merge markdown by sections
   */
  merge(base, ours, theirs) {
    const baseSections = this.parseSections(base);
    const ourSections = this.parseSections(ours);
    const theirSections = this.parseSections(theirs);

    const merged = [];
    const processedHeadings = new Set();

    // Process our sections
    for (const ourSection of ourSections) {
      const baseSection = baseSections.find(s => s.heading === ourSection.heading);
      const theirSection = theirSections.find(s => s.heading === ourSection.heading);

      if (!baseSection) {
        // New section in ours
        merged.push(ourSection);
      } else if (!theirSection) {
        // Only we edited it
        merged.push(ourSection);
      } else {
        // Both have it - take ours if we changed it, theirs if they changed it
        const baseContent = baseSection.content.join('\n');
        const ourContent = ourSection.content.join('\n');
        const theirContent = theirSection.content.join('\n');

        if (ourContent !== baseContent) {
          merged.push(ourSection);
        } else {
          merged.push(theirSection);
        }
      }

      processedHeadings.add(ourSection.heading);
    }

    // Add sections unique to theirs
    for (const theirSection of theirSections) {
      if (!processedHeadings.has(theirSection.heading)) {
        merged.push(theirSection);
      }
    }

    // Convert back to text
    return merged.map(s => {
      const heading = s.heading ? s.heading + '\n' : '';
      return heading + s.content.join('\n');
    }).join('\n');
  }
}
