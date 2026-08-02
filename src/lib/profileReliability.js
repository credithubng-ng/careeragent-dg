function normaliseEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getMatchingProfile(candidate, cvs) {
  if (!candidate?.id) {
    throw new Error("Angel's candidate profile could not be found. Please refresh or sign in again.");
  }

  const candidateOwner = normaliseEmail(candidate.owner_email || candidate.email);
  const readyCVs = (cvs || []).filter((cv) => {
    if (cv.processing_status !== "Ready" || !cv.extracted_cv_text?.trim()) return false;
    const cvOwner = normaliseEmail(cv.owner_email);
    return !candidateOwner || !cvOwner || cvOwner === candidateOwner;
  });
  const masterCV = readyCVs.find((cv) => cv.is_master);

  if (!masterCV) {
    throw new Error("Angel's processed Master CV could not be found. Check the CV Library before matching.");
  }

  return { candidate, masterCV, readyCVs, ownerEmail: candidateOwner };
}

export function assertJobOwner(job, ownerEmail) {
  const jobOwner = normaliseEmail(job?.owner_email);
  const expectedOwner = normaliseEmail(ownerEmail);
  if (jobOwner && expectedOwner && jobOwner !== expectedOwner) {
    throw new Error("This job does not belong to Angel's account and cannot be matched.");
  }
  return job;
}
