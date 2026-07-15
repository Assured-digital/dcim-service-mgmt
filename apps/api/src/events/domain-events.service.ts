import { Injectable } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { RECORD_ASSIGNED, RECORD_STATUS_CHANGED, type RecordLifecyclePayload } from "./domain-events"

// Typed publisher over EventEmitter2 — services call events.statusChanged({...}) rather
// than emit a stringly-typed name. Fire-and-forget + post-commit: a publish never blocks
// or fails the request (subscribers are best-effort), mirroring the emitNotification
// contract the emit sites had before.
@Injectable()
export class DomainEventsService {
  constructor(private emitter: EventEmitter2) {}

  statusChanged(payload: RecordLifecyclePayload): void {
    this.emitter.emit(RECORD_STATUS_CHANGED, payload)
  }

  assigned(payload: RecordLifecyclePayload): void {
    this.emitter.emit(RECORD_ASSIGNED, payload)
  }
}
