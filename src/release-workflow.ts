import type { Release } from "./types.ts";

export function reviseRelease(release: Release, fields: Partial<Pick<Release, "version" | "changes" | "languages" | "channels" | "status" | "tags" | "platforms" | "platformDetails">>): Release {
  const changed = fields.changes !== undefined && fields.changes !== release.changes;
  const languages = fields.languages || release.languages;
  return {
    ...release,
    ...fields,
    notes: release.notes.filter(note => languages.includes(note.language)).map(note => changed ? { ...note, approved: false } : { ...note }),
    proposals: changed ? release.proposals.filter(proposal => proposal.applied) : release.proposals,
  };
}

export function releaseReadiness(release: Release) {
  const missing = release.languages.filter(language => !release.notes.some(note => note.language === language && note.body.trim()));
  const unapproved = release.languages.filter(language => release.notes.some(note => note.language === language && note.body.trim() && !note.approved));
  return { missing, unapproved, confirmed: release.languages.length - missing.length - unapproved.length };
}
