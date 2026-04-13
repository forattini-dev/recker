/**
 * Minimal RedDB gRPC schema subset used by the Recker RedDB client.
 *
 * This stays static in-source so the Node build can ship a real gRPC client
 * without relying on runtime proto files.
 */
export const REDDB_PROTO = `
syntax = "proto3";

package reddb.v1;

service RedDb {
  rpc Health(Empty) returns (HealthReply);
  rpc Ready(Empty) returns (HealthReply);
  rpc Stats(Empty) returns (StatsReply);
  rpc Collections(Empty) returns (CollectionsReply);
  rpc IndexStatuses(Empty) returns (PayloadReply);
  rpc Indexes(CollectionRequest) returns (PayloadReply);
  rpc SetIndexEnabled(IndexToggleRequest) returns (PayloadReply);
  rpc WarmupIndex(IndexNameRequest) returns (PayloadReply);
  rpc RebuildIndexes(CollectionRequest) returns (PayloadReply);
  rpc Scan(ScanRequest) returns (ScanReply);
  rpc ExplainQuery(QueryRequest) returns (PayloadReply);
  rpc Query(QueryRequest) returns (QueryReply);
  rpc BatchQuery(BatchQueryRequest) returns (BatchQueryReply);
  rpc Similar(JsonCreateRequest) returns (PayloadReply);
  rpc IvfSearch(JsonCreateRequest) returns (PayloadReply);
  rpc CreateRow(JsonCreateRequest) returns (EntityReply);
  rpc CreateNode(JsonCreateRequest) returns (EntityReply);
  rpc CreateEdge(JsonCreateRequest) returns (EntityReply);
  rpc CreateVector(JsonCreateRequest) returns (EntityReply);
  rpc CreateDocument(JsonCreateRequest) returns (EntityReply);
  rpc CreateKv(JsonCreateRequest) returns (EntityReply);
  rpc BulkCreateRows(JsonBulkCreateRequest) returns (BulkEntityReply);
  rpc BulkInsertBinary(BinaryBulkInsertRequest) returns (BulkInsertReply);
  rpc BulkCreateNodes(JsonBulkCreateRequest) returns (BulkEntityReply);
  rpc BulkCreateEdges(JsonBulkCreateRequest) returns (BulkEntityReply);
  rpc BulkCreateVectors(JsonBulkCreateRequest) returns (BulkEntityReply);
  rpc BulkCreateDocuments(JsonBulkCreateRequest) returns (BulkEntityReply);
  rpc PatchEntity(UpdateEntityRequest) returns (EntityReply);
  rpc DeleteEntity(DeleteEntityRequest) returns (OperationReply);
  rpc CreateCollection(JsonPayloadRequest) returns (PayloadReply);
  rpc DropCollection(JsonPayloadRequest) returns (OperationReply);
  rpc DescribeCollection(CollectionRequest) returns (PayloadReply);
}

message Empty {}

message HealthReply {
  bool healthy = 1;
  string state = 2;
  uint64 checked_at_unix_ms = 3;
}

message StatsReply {
  uint64 collection_count = 1;
  uint64 total_entities = 2;
  uint64 total_memory_bytes = 3;
  uint64 cross_ref_count = 4;
  uint64 active_connections = 5;
  uint64 idle_connections = 6;
  uint64 total_checkouts = 7;
  bool paged_mode = 8;
  uint64 started_at_unix_ms = 9;
}

message CollectionsReply {
  repeated string collections = 1;
}

message CollectionRequest {
  string collection = 1;
  string artifact_kind = 2;
}

message IndexNameRequest {
  string name = 1;
}

message IndexToggleRequest {
  string name = 1;
  bool enabled = 2;
}

message ScanRequest {
  string collection = 1;
  uint64 offset = 2;
  uint64 limit = 3;
}

message ScanEntity {
  uint64 id = 1;
  string kind = 2;
  string collection = 3;
  string json = 4;
}

message ScanReply {
  string collection = 1;
  uint64 total = 2;
  optional uint64 next_offset = 3;
  repeated ScanEntity items = 4;
}

message QueryRequest {
  string query = 1;
  repeated string entity_types = 2;
  repeated string capabilities = 3;
}

message BatchQueryRequest {
  repeated string queries = 1;
}

message JsonPayloadRequest {
  string payload_json = 1;
}

message JsonCreateRequest {
  string collection = 1;
  string payload_json = 2;
}

message JsonBulkCreateRequest {
  string collection = 1;
  repeated string payload_json = 2;
}

message UpdateEntityRequest {
  string collection = 1;
  uint64 id = 2;
  string payload_json = 3;
}

message DeleteEntityRequest {
  string collection = 1;
  uint64 id = 2;
}

message QueryReply {
  bool ok = 1;
  string mode = 2;
  string statement = 3;
  string engine = 4;
  repeated string columns = 5;
  uint64 record_count = 6;
  string result_json = 7;
}

message BatchQueryReply {
  repeated QueryReply results = 1;
}

message EntityReply {
  bool ok = 1;
  uint64 id = 2;
  string entity_json = 3;
}

message BulkEntityReply {
  bool ok = 1;
  uint64 count = 2;
  repeated EntityReply items = 3;
}

message PayloadReply {
  bool ok = 1;
  string payload = 2;
}

message OperationReply {
  bool ok = 1;
  string message = 2;
}

message BinaryBulkInsertRequest {
  string collection = 1;
  repeated string field_names = 2;
  repeated BinaryRow rows = 3;
}

message BinaryRow {
  repeated BinaryValue values = 1;
}

message BinaryValue {
  oneof kind {
    string text_value = 1;
    int64 int_value = 2;
    double float_value = 3;
    bool bool_value = 4;
    bytes blob_value = 5;
  }
}

message BulkInsertReply {
  bool ok = 1;
  uint64 count = 2;
  uint64 first_id = 3;
}
`;
