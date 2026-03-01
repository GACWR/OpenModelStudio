const { postgraphile } = require("postgraphile");
const http = require("http");

const DATABASE_URL = process.env.DATABASE_URL || "postgres://openmodelstudio:openmodelstudio_secret@localhost:5432/openmodelstudio";
const PORT = parseInt(process.env.PORT || "5433", 10);
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-jwt-secret-key";

const middleware = postgraphile(DATABASE_URL, "public", {
  watchPg: true,
  graphiql: true,
  enhanceGraphiql: true,
  dynamicJson: true,
  setofFunctionsContainNulls: false,
  ignoreRBAC: false,
  enableCors: true,
  allowExplain: process.env.NODE_ENV !== "production",
  jwtSecret: JWT_SECRET,
  jwtPgTypeIdentifier: "public.jwt_token",
  legacyRelations: "omit",
  appendPlugins: [require("@graphile-contrib/pg-simplify-inflector")],
  retryOnInitFail: true,
  graphileBuildOptions: {
    pgOmitListSuffix: true,
  },
});

const server = http.createServer(middleware);
server.listen(PORT, () => {
  console.log(`PostGraphile listening on port ${PORT}`);
  console.log(`  GraphiQL: http://localhost:${PORT}/graphiql`);
  console.log(`  GraphQL:  http://localhost:${PORT}/graphql`);
});
