export function formatWait(arrivalAt, now) {
  const seconds=(arrivalAt-now)/1000;
  return seconds<60?'まもなく':`あと${Math.floor(seconds/60)}分`;
}
export function serviceLabel(route) {
  if(route.endsWith('BUS'))return {name:'代行バス',number:route.slice(0,-3),kind:'replacement'};
  if(route.endsWith('OWL'))return {name:'深夜バス',number:route.slice(0,-3),kind:'owl'};
  if(route==='F')return {name:'路面電車',number:'F',kind:'streetcar'};
  return {name:'路線バス',number:route,kind:'bus'};
}
// Merge every platform before sorting. Never reserve rows for a particular line.
export function upcomingDepartures(stops,now,{limit=5,unavailable=false}={}) {
  if(unavailable)return [];
  return stops.filter(stop=>!stop.stale&&now-stop.fetchedAt<=45000)
    .flatMap(stop=>stop.services.flatMap(service=>service.arrivals.filter(t=>t>=now)
      .map(arrivalAt=>({stop,route:service.route,destination:service.destination,arrivalAt,
        key:`${stop.id}:${service.route}:${service.destination}:${service.ids?.[arrivalAt] || arrivalAt}`}))))
    .sort((a,b)=>a.arrivalAt-b.arrivalAt||a.stop.id.localeCompare(b.stop.id)||a.route.localeCompare(b.route))
    .slice(0,limit);
}
