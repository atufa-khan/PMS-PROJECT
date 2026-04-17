type InternalJobAuthInput = {
  expectedSecret?: string | null;
  headerSecret?: string | null;
  authorizationHeader?: string | null;
  querySecret?: string | null;
};

function extractBearerSecret(authorizationHeader?: string | null) {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function resolveInternalJobSecret({
  headerSecret,
  authorizationHeader,
  querySecret
}: Omit<InternalJobAuthInput, "expectedSecret">) {
  return (
    headerSecret?.trim() ||
    extractBearerSecret(authorizationHeader) ||
    querySecret?.trim() ||
    null
  );
}

export function isInternalJobAuthorized({
  expectedSecret,
  headerSecret,
  authorizationHeader,
  querySecret
}: InternalJobAuthInput) {
  if (!expectedSecret) {
    return false;
  }

  return (
    resolveInternalJobSecret({
      headerSecret,
      authorizationHeader,
      querySecret
    }) === expectedSecret
  );
}
