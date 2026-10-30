// Diagnostic-only local fit. Same banded objective as existing fitRampProfile; more ADMM iterations for fixed crossing envelopes.
export function fitLocalProfile(s:readonly number[],original:readonly number[],fixed:ReadonlyMap<number,number>,scale=18,bounds?:{lower:readonly number[];upper:readonly number[]},maxGrade?:number):number[]{
  const n=s.length;if(n!==original.length||n<2||!Number.isFinite(scale)||scale<=0||original.some(y=>!Number.isFinite(y))||s.some((v,i)=>!Number.isFinite(v)||i>0&&v<=s[i-1]!))throw new Error('Invalid profile stations');
  const a=Array.from({length:n},()=>[0,0,0]),b=Array(n).fill(0) as number[];
  const add=(indices:number[],coefficients:number[],target:number,weight:number)=>{
    let t=target;indices.forEach((i,k)=>{if(fixed.has(i))t-=coefficients[k]!*fixed.get(i)!;});
    indices.forEach((i,k)=>{if(fixed.has(i))return;b[i]!+=weight*coefficients[k]!*t;indices.forEach((j,l)=>{if(j<=i&&!fixed.has(j))a[i]![i-j]!+=weight*coefficients[k]!*coefficients[l]!;});});
  };
  for(let i=0;i<n;i++)add([i],[1],original[i]!,Math.max(.1,((s[Math.min(n-1,i+1)]??0)-(s[Math.max(0,i-1)]??0))/2));
  for(let i=1;i<n-1;i++){const l=s[i]!-s[i-1]!,r=s[i+1]!-s[i]!,span=(l+r)/2;add([i-1,i,i+1],[1/l,-1/l-1/r,1/r],0,scale**4/span);}
  const gradeRho=50000,gradeZ=Array.from({length:n-1},(_,i)=>Math.max(-(maxGrade??Infinity),Math.min(maxGrade??Infinity,(original[i+1]!-original[i]!)/(s[i+1]!-s[i]!)))),gradeDual=Array(n-1).fill(0) as number[];
  if(maxGrade)for(let i=0;i<n-1;i++){const d=s[i+1]!-s[i]!;add([i,i+1],[-1/d,1/d],0,gradeRho);}
  for(const [i,y]of fixed){if(!Number.isInteger(i)||i<0||i>=n||!Number.isFinite(y))throw new Error('Invalid fixed height');a[i]=[1,0,0];b[i]=y;}
  const rho=200;
  if(bounds){if(bounds.lower.length!==n||bounds.upper.length!==n||bounds.lower.some((v,i)=>Number.isNaN(v)||Number.isNaN(bounds.upper[i])||v>bounds.upper[i]!))throw new Error('Invalid profile bounds');for(const [i,y]of fixed)if(y<bounds.lower[i]!-1e-8||y>bounds.upper[i]!+1e-8)throw new Error('Height anchor conflicts with clearance bounds');for(let i=0;i<n;i++)if(!fixed.has(i))a[i]![0]!+=rho;}
  const l=Array.from({length:n},()=>[0,0,0]);
  for(let i=0;i<n;i++)for(let j=Math.max(0,i-2);j<=i;j++){
    let v=a[i]![i-j]!;for(let k=Math.max(0,i-2,j-2);k<j;k++)if(i-k<=2&&j-k<=2)v-=l[i]![i-k]!*l[j]![j-k]!;
    if(!Number.isFinite(v)||i===j&&v<=0)throw new Error('Profile fit is numerically singular');
    l[i]![i-j]=i===j?Math.sqrt(v):v/l[j]![0]!;
  }
  const y=Array(n).fill(0) as number[],x=Array(n).fill(0) as number[],z=original.slice(),dual=Array(n).fill(0) as number[];
  if(bounds)for(let i=0;i<n;i++)z[i]=fixed.get(i)??Math.max(bounds.lower[i]!,Math.min(bounds.upper[i]!,z[i]!));
  const maxIterations=bounds?30000:1;
  for(let iteration=0;iteration<maxIterations;iteration++){
    for(let i=0;i<n;i++){let v=b[i]!+(bounds&&!fixed.has(i)?rho*(z[i]!-dual[i]!):0);if(maxGrade&&!fixed.has(i)){if(i)v+=gradeRho*(gradeZ[i-1]!-gradeDual[i-1]!)/(s[i]!-s[i-1]!);if(i<n-1)v-=gradeRho*(gradeZ[i]!-gradeDual[i]!)/(s[i+1]!-s[i]!);}for(let j=Math.max(0,i-2);j<i;j++)v-=l[i]![i-j]!*y[j]!;y[i]=v/l[i]![0]!;}
    for(let i=n-1;i>=0;i--){let v=y[i]!;for(let j=i+1;j<=Math.min(n-1,i+2);j++)v-=l[j]![j-i]!*x[j]!;x[i]=v/l[i]![0]!;}
    if(!bounds)return x;
    let residual=0,change=0;
    for(let i=0;i<n;i++){const prior=z[i]!;z[i]=fixed.get(i)??Math.max(bounds.lower[i]!,Math.min(bounds.upper[i]!,x[i]!+dual[i]!));dual[i]!+=x[i]!-z[i]!;residual=Math.max(residual,Math.abs(x[i]!-z[i]!));change=Math.max(change,Math.abs(z[i]!-prior));}
    if(maxGrade)for(let i=0;i<n-1;i++){const g=(x[i+1]!-x[i]!)/(s[i+1]!-s[i]!),prior=gradeZ[i]!;gradeZ[i]=Math.max(-maxGrade,Math.min(maxGrade,g+gradeDual[i]!));gradeDual[i]!+=g-gradeZ[i]!;residual=Math.max(residual,Math.abs(g-gradeZ[i]!));change=Math.max(change,Math.abs(prior-gradeZ[i]!));}
    if(residual<1e-5&&change<1e-5)return z;
    if(iteration===maxIterations-1&&residual>.001)throw new Error('Bounded profile did not converge: '+residual);
  }
  return z;
}
