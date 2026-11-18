/** Process-local identity, shared by RenderWorld packets and GPU ledgers.
 * Weak keys do not keep unloaded assets resident. Renderer ownership is separate. */
const handles=new WeakMap<object,number>();let next=1;
export function renderResourceHandle(resource:object):number {let handle=handles.get(resource);if(handle===undefined){handle=next++;handles.set(resource,handle);}return handle;}
