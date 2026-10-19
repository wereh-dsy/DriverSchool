# Repair queue detail — 仅建议，未执行

P3 全部在 repair-queue.json，避免在 Markdown 展开大量冗余点。

## Q1 春晖

P0/P1 review queued

### CM266-00014 · P0 · error · topology.expresswayCrossing

对象：north-roundabout:ring-6；配对：v4-north-split-split-m91-approach

原因：同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000000 m。

判定：confirmed data-level unjunctioned crossing；误报可能：unlikely

建议方法：manual topology edit after visual confirmation; remove redundant approach or create one intentional junction（未执行）。

### CM266-00015 · P0 · error · topology.expresswayCrossing

对象：north-roundabout:entry-3；配对：urban-north-arterial-split-split-m91-approach

原因：同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000377 m。

判定：confirmed data-level unjunctioned crossing；误报可能：unlikely

建议方法：manual topology edit after visual confirmation; remove redundant approach or create one intentional junction（未执行）。

### CM266-00016 · P0 · error · topology.expresswayCrossing

对象：north-roundabout:exit-3；配对：urban-north-arterial-split-m91

原因：同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000000 m。

判定：confirmed data-level unjunctioned crossing；误报可能：unlikely

建议方法：manual topology edit after visual confirmation; remove redundant approach or create one intentional junction（未执行）。

### CM266-02783 · P0 · info · topology.deadEnd

对象：v9-newcity-seven-split-split-split-split-split

原因：支路端点接近其他道路但没有显式连接；最近同层道路 v9-chunhui-east-split-split-split，水平距 0.214 m、高差 0.369 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00331 · P1 · warning · vertical.abruptGradeChange

对象：v61-exhibition-road-split-split

原因：短区间坡度变化 10.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00339 · P1 · warning · vertical.abruptGradeChange

对象：v9-chunhui-east-split-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00344 · P1 · warning · vertical.abruptGradeChange

对象：v9-newcity-nine-south-split-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00345 · P1 · warning · vertical.abruptGradeChange

对象：v9-newcity-ten-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00347 · P1 · warning · vertical.abruptGradeChange

对象：v9-newcity-ten-split-split-split

原因：短区间坡度变化 8.4 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00350 · P1 · warning · vertical.abruptGradeChange

对象：v9-newcity-eight-split-split-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00354 · P1 · warning · vertical.abruptGradeChange

对象：v9-newcity-eight-split-split-split-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00356 · P1 · warning · vertical.abruptGradeChange

对象：v9-newcity-three-split-split-split-split-split

原因：短区间坡度变化 10.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00365 · P1 · warning · vertical.abruptGradeChange

对象：v61-exhibition-road-split-split-split

原因：短区间坡度变化 12.5 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00001 · P2 · error · geometry.sharpBend

对象：north-roundabout:ring-2

原因：90° bend over 7.5 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00002 · P2 · error · geometry.sharpBend

对象：north-roundabout:exit-3

原因：113° bend over 9.1 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00003 · P2 · error · geometry.sharpBend

对象：north-roundabout:ring-7

原因：97° bend over 5.7 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00004 · P2 · error · geometry.sharpBend

对象：urban-east-arterial-split-split-3-split

原因：84° bend over 16.1 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00005 · P2 · error · geometry.sharpBend

对象：urban-diagonal-split-split-split-split-3

原因：86° bend over 13.2 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00007 · P2 · error · geometry.sharpBend

对象：urban-east-arterial-split-split-3-split-2

原因：90° bend over 13 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00008 · P2 · error · geometry.sharpBend

对象：v61-exhibition-road-split-split-split

原因：88° bend over 21.3 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00009 · P2 · error · geometry.sharpBend

对象：north-roundabout:entry-3

原因：128° bend over 11.3 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00018 · P2 · warning · geometry.awkwardS

对象：north-roundabout:exit-3

原因：Tight S bend between two opposite turns

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00019 · P2 · warning · geometry.awkwardS

对象：north-roundabout:entry-3

原因：Tight S bend between two opposite turns

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00030 · P2 · warning · intersection.acuteApproach

对象：urban-junction-69

原因：Arms east and south meet at 4°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00031 · P2 · warning · intersection.acuteApproach

对象：urban-junction-70

原因：Arms north and west meet at 28°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00033 · P2 · warning · intersection.acuteApproach

对象：urban-junction-40

原因：Arms south and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00034 · P2 · warning · intersection.acuteApproach

对象：urban-junction-44

原因：Arms north and east meet at 23°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00038 · P2 · warning · intersection.acuteApproach

对象：urban-junction-97

原因：Arms north and east meet at 2°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00070 · P2 · warning · intersection.acuteApproach

对象：urban-junction-186

原因：Arms north and east meet at 19°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00071 · P2 · warning · intersection.acuteApproach

对象：urban-junction-194

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00072 · P2 · warning · intersection.acuteApproach

对象：urban-junction-196

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00073 · P2 · warning · intersection.acuteApproach

对象：urban-junction-199

原因：Arms east and south meet at 14°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00074 · P2 · warning · intersection.acuteApproach

对象：urban-junction-200

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00075 · P2 · warning · intersection.acuteApproach

对象：urban-junction-201

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00076 · P2 · warning · intersection.acuteApproach

对象：urban-junction-202

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00077 · P2 · warning · intersection.acuteApproach

对象：urban-junction-206

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00078 · P2 · warning · intersection.acuteApproach

对象：urban-junction-240

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00079 · P2 · warning · intersection.acuteApproach

对象：urban-junction-241

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00080 · P2 · warning · intersection.acuteApproach

对象：urban-junction-242

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00081 · P2 · warning · intersection.acuteApproach

对象：urban-junction-245

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00082 · P2 · warning · intersection.acuteApproach

对象：urban-junction-246

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00083 · P2 · warning · intersection.acuteApproach

对象：urban-junction-251

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00085 · P2 · warning · intersection.approachKink

对象：urban-junction-65

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00086 · P2 · warning · intersection.approachKink

对象：urban-junction-69

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00087 · P2 · warning · intersection.approachKink

对象：urban-junction-70

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00089 · P2 · warning · intersection.approachKink

对象：urban-junction-40

原因：Approach south runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00090 · P2 · warning · intersection.approachKink

对象：urban-junction-44

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00091 · P2 · warning · intersection.approachKink

对象：urban-junction-97

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00109 · P2 · warning · intersection.approachKink

对象：urban-junction-186

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00110 · P2 · warning · intersection.approachKink

对象：urban-junction-194

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00111 · P2 · warning · intersection.approachKink

对象：urban-junction-196

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00112 · P2 · warning · intersection.approachKink

对象：urban-junction-199

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00113 · P2 · warning · intersection.approachKink

对象：urban-junction-200

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00114 · P2 · warning · intersection.approachKink

对象：urban-junction-201

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00115 · P2 · warning · intersection.approachKink

对象：urban-junction-202

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00116 · P2 · warning · intersection.approachKink

对象：urban-junction-206

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00117 · P2 · warning · intersection.approachKink

对象：urban-junction-240

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00118 · P2 · warning · intersection.approachKink

对象：urban-junction-241

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00119 · P2 · warning · intersection.approachKink

对象：urban-junction-242

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00120 · P2 · warning · intersection.approachKink

对象：urban-junction-245

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00121 · P2 · warning · intersection.approachKink

对象：urban-junction-246

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00122 · P2 · warning · intersection.approachKink

对象：urban-junction-251

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00123 · P2 · warning · intersection.shortApproach

对象：urban-junction-70

原因：Approach urban-roundabout-South-entry is only 11.7 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00134 · P2 · warning · intersection.shortApproach

对象：urban-junction-203

原因：Approach v9-newcity-five-north-split is only 11 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00135 · P2 · warning · intersection.shortApproach

对象：urban-junction-206

原因：Approach v9-newcity-five-north-split is only 11 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00137 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-63

原因：Port east bearing differs from the road by 40°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00138 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-69

原因：Port west bearing differs from the road by 50°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00139 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-70

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00145 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-97

原因：Port north bearing differs from the road by 48°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00181 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-17

原因：Port south bearing differs from the road by 40°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00183 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-194

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00184 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-196

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00185 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-199

原因：Port south bearing differs from the road by 76°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00186 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-200

原因：Port north bearing differs from the road by 35°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00187 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-201

原因：Port east bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00188 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-202

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00189 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-206

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00190 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-240

原因：Port east bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00191 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-241

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00192 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-242

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00193 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-245

原因：Port east bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00194 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-246

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00195 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-251

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00196 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-69

原因：Crosswalks on east and south overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00197 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-40

原因：Crosswalks on south and west overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00206 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-63

原因：Stop line on east is 12 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00207 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-64

原因：Stop line on north is 18 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00208 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-66

原因：Stop line on north is 23.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00209 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-69

原因：Stop line on west is 15.2 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00210 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-70

原因：Stop line on west is 15.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00211 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-19

原因：Stop line on north is 15.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00214 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-60

原因：Stop line on north is 17.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00219 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-97

原因：Stop line on south is 17.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00222 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-127

原因：Stop line on north is 13.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00241 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-186

原因：Stop line on south is 10.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00242 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-199

原因：Stop line on east is 24.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00243 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-200

原因：Stop line on west is 26 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00270 · P2 · warning · topology.deadEnd

对象：v9-chunhui-east

原因：城市道路开放端，最近同层道路距 80.94 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00272 · P2 · warning · topology.deadEnd

对象：urban-north-arterial-split-m91

原因：城市道路开放端，最近同层道路距 22.18 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00281 · P2 · warning · topology.deadEnd

对象：v61-exhibition-road-split-split-split-split

原因：城市道路开放端，最近同层道路距 89.04 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00288 · P2 · warning · topology.deadEnd

对象：urban-east-arterial-split-split-split

原因：城市道路开放端，最近同层道路距 88.42 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02744 · P2 · info · topology.deadEnd

对象：v9-newcity-two

原因：城市道路开放端，最近同层道路距 32.87 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02745 · P2 · info · topology.deadEnd

对象：v9-newcity-six-north

原因：城市道路开放端，最近同层道路距 25.10 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02746 · P2 · info · topology.deadEnd

对象：v9-newcity-six-south

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02747 · P2 · info · topology.deadEnd

对象：v9-newcity-five-north

原因：城市道路开放端，最近同层道路距 20.21 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02748 · P2 · info · topology.deadEnd

对象：v9-newcity-five-south

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02749 · P2 · info · topology.deadEnd

对象：v9-newcity-nine-north

原因：城市道路开放端，最近同层道路距 13.77 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02750 · P2 · info · topology.deadEnd

对象：v9-newcity-nine-south

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02751 · P2 · info · topology.deadEnd

对象：v9-newcity-ten

原因：城市道路开放端，最近同层道路距 7.11 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02753 · P2 · info · topology.deadEnd

对象：v3-east-collector-m91

原因：城市道路开放端，最近同层道路距 67.17 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02765 · P2 · info · topology.deadEnd

对象：v9-newcity-two-split-split-split-split-split

原因：城市道路开放端，最近同层道路距 17.51 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02766 · P2 · info · topology.deadEnd

对象：v9-newcity-six-south-split-split-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02767 · P2 · info · topology.deadEnd

对象：v9-newcity-six-north-split-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02768 · P2 · info · topology.deadEnd

对象：v9-newcity-five-south-split-split-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02769 · P2 · info · topology.deadEnd

对象：v9-newcity-five-north-split-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02770 · P2 · info · topology.deadEnd

对象：v9-newcity-nine-north-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02771 · P2 · info · topology.deadEnd

对象：v9-newcity-nine-south-split-split-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02772 · P2 · info · topology.deadEnd

对象：v9-newcity-ten-split-split-split-split

原因：城市道路开放端，最近同层道路距 17.50 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02778 · P2 · info · topology.deadEnd

对象：v3-east-collector-split-m91

原因：城市道路开放端，最近同层道路距 68.28 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02784 · P2 · info · topology.deadEnd

对象：v9-newcity-eight-split-split-split-split-split

原因：城市道路开放端，最近同层道路距 120.74 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q2 南城

P0/P1 review queued

### CM266-00252 · P0 · warning · topology.deadEnd

对象：regional:S26:out:split154

原因：城区附近快速路开放端；最近同层道路 regional:logistics:N-to-E-star，水平距 7.500 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00280 · P0 · warning · topology.deadEnd

对象：regional:S26:in:split82:split96:split130:split136:split150:split168

原因：城区附近快速路开放端；最近同层道路 regional:logistics:W-to-N-star:acceleration，水平距 7.500 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00284 · P0 · warning · topology.deadEnd

对象：regional:S26:out:split370:lane188

原因：城区附近快速路开放端；最近同层道路 regional:logistics:N-to-E-star:deceleration，水平距 7.500 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00330 · P1 · warning · vertical.abruptGradeChange

对象：v4-south-split-2-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00343 · P1 · warning · vertical.abruptGradeChange

对象：v4-south-split-2-split-split-2

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00346 · P1 · warning · vertical.abruptGradeChange

对象：v8-industrial-west-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00352 · P1 · warning · vertical.abruptGradeChange

对象：v4-industrial-split-2-split-2

原因：短区间坡度变化 8.7 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00364 · P1 · warning · vertical.abruptGradeChange

对象：v4-industrial-split-2-split

原因：短区间坡度变化 20 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00367 · P1 · warning · vertical.abruptGradeChange

对象：v8-nancheng-ring

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00382 · P1 · warning · vertical.abruptGradeChange

对象：v4-south-logistics-west

原因：短区间坡度变化 12.7 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00021 · P2 · warning · geometry.sharpBend

对象：v8-nancheng-ring-split-split

原因：60° bend over 19.9 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00060 · P2 · warning · intersection.acuteApproach

对象：urban-junction-222

原因：Arms north and east meet at 17°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00063 · P2 · warning · intersection.acuteApproach

对象：urban-junction-228

原因：Arms north and east meet at 20°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00064 · P2 · warning · intersection.acuteApproach

对象：urban-junction-229

原因：Arms south and west meet at 4°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00084 · P2 · warning · intersection.acuteApproach

对象：v91-local-junction-8

原因：Arms north and south meet at 24°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00104 · P2 · warning · intersection.approachKink

对象：urban-junction-228

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00166 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-51

原因：Port north bearing differs from the road by 133°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00177 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-229

原因：Port west bearing differs from the road by 63°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00202 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-228

原因：Crosswalks on south and west overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00215 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-72

原因：Stop line on north is 17.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00227 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-51

原因：Stop line on north is 16 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00233 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-219

原因：Stop line on north is 9.2 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00234 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-222

原因：Stop line on north is 28.4 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00238 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-228

原因：Stop line on south is 18.4 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00244 · P2 · warning · marking.stopLineDisplaced

对象：v91-local-junction-8

原因：Stop line on north is 20.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00245 · P2 · warning · marking.stopLineDisplaced

对象：v91-local-junction-11

原因：Stop line on north is 8.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00279 · P2 · warning · topology.deadEnd

对象：v4-west-split-split-m91

原因：城市道路开放端，最近同层道路距 65.30 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02754 · P2 · info · topology.deadEnd

对象：v4-diagonal-m91

原因：城市道路开放端，最近同层道路距 37.19 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q3 北岭外围

P0/P1 review queued

### CM266-00250 · P0 · warning · topology.deadEnd

对象：regional:S68:out

原因：城区附近快速路开放端；最近同层道路 regional:S68:in:split16:split22，水平距 16.250 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00285 · P0 · warning · topology.deadEnd

对象：regional:S68:in:split16:split22

原因：城区附近快速路开放端；最近同层道路 regional:S68:out，水平距 16.250 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00328 · P1 · warning · vertical.abruptGradeChange

对象：regional:v2:northwest:S-to-W-loop

原因：短区间坡度变化 7.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00329 · P1 · warning · vertical.abruptGradeChange

对象：regional:v2:northwest:N-to-E-loop

原因：短区间坡度变化 7.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00363 · P1 · warning · vertical.abruptGradeChange

对象：regional:v2:northwest:W-to-N-loop

原因：短区间坡度变化 7.3 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00369 · P1 · warning · vertical.abruptGradeChange

对象：regional:v2:northwest:E-to-S-loop

原因：短区间坡度变化 7.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00390 · P1 · warning · vertical.abruptGradeChange

对象：regional:v2:northwest:W-to-S-right

原因：短区间坡度变化 7.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00309 · P2 · warning · topology.tinyFragment

对象：regional:G65:out:0

原因：Road fragment is only 2.1 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-00312 · P2 · warning · topology.tinyFragment

对象：regional:G65:in:11:revision224

原因：Road fragment is only 1.9 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

## Q4 通港

P0/P1 review queued

### CM266-00251 · P0 · warning · topology.deadEnd

对象：regional:S68:in

原因：城区附近快速路开放端；最近同层道路 regional:S68:out:split12:split30:split36:split88:split94，水平距 16.250 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00286 · P0 · warning · topology.deadEnd

对象：regional:S68:out:split12:split30:split36:split88:split94

原因：城区附近快速路开放端；最近同层道路 regional:S68:in，水平距 16.250 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00336 · P1 · warning · vertical.abruptGradeChange

对象：v4-access-5

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00360 · P1 · warning · vertical.abruptGradeChange

对象：v4-south-logistics-east-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00378 · P1 · warning · vertical.abruptGradeChange

对象：v4-south-logistics-east

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00020 · P2 · warning · geometry.sharpBend

对象：v4-access-5

原因：60° bend over 14.3 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00036 · P2 · warning · intersection.acuteApproach

对象：urban-junction-85

原因：Arms north and west meet at 21°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00043 · P2 · warning · intersection.acuteApproach

对象：urban-junction-159

原因：Arms east and west meet at 28°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00061 · P2 · warning · intersection.acuteApproach

对象：urban-junction-225

原因：Arms north and east meet at 27°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00062 · P2 · warning · intersection.acuteApproach

对象：urban-junction-227

原因：Arms east and west meet at 27°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00065 · P2 · warning · intersection.acuteApproach

对象：urban-junction-231

原因：Arms north and east meet at 2°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00066 · P2 · warning · intersection.acuteApproach

对象：urban-junction-234

原因：Arms east and west meet at 11°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00067 · P2 · warning · intersection.acuteApproach

对象：urban-junction-235

原因：Arms north and east meet at 8°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00068 · P2 · warning · intersection.acuteApproach

对象：urban-junction-236

原因：Arms north and south meet at 15°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00105 · P2 · warning · intersection.approachKink

对象：urban-junction-231

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00106 · P2 · warning · intersection.approachKink

对象：urban-junction-235

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00107 · P2 · warning · intersection.approachKink

对象：urban-junction-236

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00144 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-85

原因：Port west bearing differs from the road by 34°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00147 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-210

原因：Port east bearing differs from the road by 54°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00201 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-227

原因：Crosswalks on east and west overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00203 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-231

原因：Crosswalks on north and east overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00204 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-234

原因：Crosswalks on east and west overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00205 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-235

原因：Crosswalks on north and east overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00226 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-159

原因：Stop line on east is 22 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00235 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-224

原因：Stop line on north is 10.4 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00236 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-225

原因：Stop line on north is 20 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00237 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-227

原因：Stop line on east is 14 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00239 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-234

原因：Stop line on east is 13.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00275 · P2 · warning · topology.deadEnd

对象：v6-logistics-one-split-2-split-m91

原因：城市道路开放端，最近同层道路距 69.40 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00276 · P2 · warning · topology.deadEnd

对象：v8-tonggang-avenue-m91

原因：城市道路开放端，最近同层道路距 60.24 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00277 · P2 · warning · topology.deadEnd

对象：v4-access-3-c91

原因：城市道路开放端，最近同层道路距 156.13 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00278 · P2 · warning · topology.deadEnd

对象：v61-sports-road-c91

原因：城市道路开放端，最近同层道路距 306.75 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00283 · P2 · warning · topology.deadEnd

对象：v8-tonggang-avenue-split-m91

原因：城市道路开放端，最近同层道路距 247.29 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q5 星湖 / 北城 / 大学片区

P0/P1 review queued

### CM266-02774 · P0 · info · topology.deadEnd

对象：v4-diagonal-split-split-m91

原因：支路端点接近其他道路但没有显式连接；最近同层道路 v4-north-split-2-m91，水平距 0.615 m、高差 0.000 m。

判定：manual confirmation required / possible navigation cutoff；误报可能：possible intentional terminus

建议方法：manual topology edit or confirm intentional signed/closed terminus（未执行）。

### CM266-00006 · P2 · error · geometry.sharpBend

对象：v61-university-north-split-split

原因：98° bend over 8 m

判定：geometry defect candidate；误报可能：possible intentional low-speed turn

建议方法：smoothRoad; preserve meaningful regional direction（未执行）。

### CM266-00055 · P2 · warning · intersection.acuteApproach

对象：urban-junction-179

原因：Arms north and south meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00057 · P2 · warning · intersection.acuteApproach

对象：urban-junction-213

原因：Arms east and west meet at 18°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00103 · P2 · warning · intersection.approachKink

对象：urban-junction-179

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00170 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-179

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00174 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-213

原因：Port north bearing differs from the road by 146°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00180 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-198

原因：Port east bearing differs from the road by 29°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00232 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-213

原因：Stop line on north is 11.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00240 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-177

原因：Stop line on east is 8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-02738 · P2 · info · geometry.shortSegments

对象：v9-lake-loop-south-split

原因：3 road segments shorter than 1.5 m

判定：needs review；误报可能：possible

建议方法：smoothRoad（未执行）。

### CM266-02739 · P2 · info · geometry.shortSegments

对象：v9-lake-loop-north-split-split-c91

原因：2 road segments shorter than 1.5 m

判定：needs review；误报可能：possible

建议方法：smoothRoad（未执行）。

### CM266-02743 · P2 · info · topology.deadEnd

对象：v61-university-north

原因：城市道路开放端，最近同层道路距 112.06 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02786 · P2 · info · topology.deadEnd

对象：v61-university-north-split-split

原因：城市道路开放端，最近同层道路距 387.15 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q6 北环门户

P0/P1 review queued

### CM266-00307 · P1 · warning · topology.lowClearance

对象：system-north:S-to-E-right；配对：system-north:S-to-W-star

原因：中心线高差 4.85 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。

判定：critical / 临界；误报可能：possible; centerline separation is not underside clearance

建议方法：manual clearance adjustment after structural envelope review（未执行）。

### CM266-00308 · P1 · warning · topology.lowClearance

对象：ring-cw-0-split-split-split-2-split-split；配对：system-north:E-to-S-star

原因：中心线高差 5.45 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。

判定：possibly reasonable / 可能合理；误报可能：possible; centerline separation is not underside clearance

建议方法：manual clearance adjustment after structural envelope review（未执行）。

### CM266-00322 · P1 · warning · vertical.abruptGradeChange

对象：v8-ring-north:off--1

原因：短区间坡度变化 7.7 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00337 · P1 · warning · vertical.abruptGradeChange

对象：system-north:W-to-N-star

原因：短区间坡度变化 7.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00357 · P1 · warning · vertical.abruptGradeChange

对象：v8-ring-north:on--1

原因：短区间坡度变化 7.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00377 · P1 · warning · vertical.abruptGradeChange

对象：system-north:E-to-S-star

原因：短区间坡度变化 23 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00380 · P1 · warning · vertical.abruptGradeChange

对象：system-north:S-to-W-star

原因：短区间坡度变化 22 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00402 · P1 · warning · vertical.elevationPointOscillation

对象：system-north:S-to-W-star

原因：3 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00403 · P1 · warning · vertical.elevationPointOscillation

对象：system-north:E-to-S-star

原因：5 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00428 · P1 · warning · vertical.wave

对象：system-north:S-to-W-star

原因：Elevation oscillates 9 times (0.12 m RMS)

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00429 · P1 · warning · vertical.wave

对象：system-north:E-to-S-star

原因：Elevation oscillates 9 times (0.14 m RMS)

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-02873 · P1 · info · vertical.rampReversal

对象：system-north:S-to-W-star

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 55.86 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02874 · P1 · info · vertical.rampReversal

对象：system-north:E-to-S-star

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 54.90 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-00246 · P2 · warning · marking.stopLineDisplaced

对象：v91-ring-north-inner-junction

原因：Stop line on east is 8.4 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-02763 · P2 · info · topology.deadEnd

对象：v91-ring-north-outer-cd

原因：城市道路开放端，最近同层道路距 105.14 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02777 · P2 · info · topology.deadEnd

对象：v91-ring-north-outer-cd-section-section

原因：城市道路开放端，最近同层道路距 98.22 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q7 承景路东西快速路走廊

P0/P1 review queued

### CM266-00324 · P1 · warning · vertical.abruptGradeChange

对象：system-east:N-to-W-right

原因：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00325 · P1 · warning · vertical.abruptGradeChange

对象：system-east:S-to-E-right

原因：短区间坡度变化 7.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00348 · P1 · warning · vertical.abruptGradeChange

对象：system-east:E-to-N-right

原因：短区间坡度变化 7.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00351 · P1 · warning · vertical.abruptGradeChange

对象：system-east:W-to-S-right

原因：短区间坡度变化 7.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00359 · P1 · warning · vertical.abruptGradeChange

对象：system-east:E-to-S-turbine

原因：短区间坡度变化 18 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00370 · P1 · warning · vertical.abruptGradeChange

对象：system-east:W-to-N-turbine

原因：短区间坡度变化 17.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00374 · P1 · warning · vertical.abruptGradeChange

对象：system-east:S-to-W-turbine

原因：短区间坡度变化 19.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00379 · P1 · warning · vertical.abruptGradeChange

对象：system-east:N-to-E-turbine

原因：短区间坡度变化 19.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00408 · P1 · warning · vertical.elevationPointOscillation

对象：system-east:S-to-W-turbine

原因：8 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00409 · P1 · warning · vertical.elevationPointOscillation

对象：system-east:E-to-S-turbine

原因：6 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00410 · P1 · warning · vertical.elevationPointOscillation

对象：system-east:N-to-E-turbine

原因：8 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00411 · P1 · warning · vertical.elevationPointOscillation

对象：system-east:W-to-N-turbine

原因：6 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00430 · P1 · warning · vertical.wave

对象：system-east:S-to-W-turbine

原因：Elevation oscillates 13 times (0.11 m RMS)

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00431 · P1 · warning · vertical.wave

对象：system-east:N-to-E-turbine

原因：Elevation oscillates 13 times (0.12 m RMS)

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-02835 · P1 · info · vertical.gradeReversals

对象：system-east:E-to-S-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 48.85 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02836 · P1 · info · vertical.gradeReversals

对象：system-east:W-to-N-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 47.82 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02882 · P1 · info · vertical.rampReversal

对象：system-east:S-to-W-turbine

原因：多次升降需分段核查；坡向反转 12 次，累计高程变化 38.17 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02883 · P1 · info · vertical.rampReversal

对象：system-east:E-to-S-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 48.85 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02884 · P1 · info · vertical.rampReversal

对象：system-east:N-to-E-turbine

原因：多次升降需分段核查；坡向反转 12 次，累计高程变化 41.27 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02885 · P1 · info · vertical.rampReversal

对象：system-east:W-to-N-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 47.82 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-00047 · P2 · warning · intersection.acuteApproach

对象：urban-junction-9

原因：Arms north and east meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00097 · P2 · warning · intersection.approachKink

对象：urban-junction-9

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00149 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-2

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00150 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-3

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00151 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-4

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00152 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-5

原因：Port north bearing differs from the road by 51°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00153 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-6

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00155 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-8

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00156 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-9

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00157 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-10

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00168 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-53

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00169 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-90

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00171 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-182

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00182 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-190

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

## Q8 新世纪广场 / 中央互通

P0/P1 review queued

### CM266-00333 · P1 · warning · vertical.abruptGradeChange

对象：system-central:W-to-S-right

原因：短区间坡度变化 13.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00373 · P1 · warning · vertical.abruptGradeChange

对象：system-central:S-to-E-right

原因：短区间坡度变化 7.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00383 · P1 · warning · vertical.abruptGradeChange

对象：system-central:W-to-N-semi

原因：短区间坡度变化 12.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00384 · P1 · warning · vertical.abruptGradeChange

对象：system-central:E-to-S-semi

原因：短区间坡度变化 13.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00385 · P1 · warning · vertical.abruptGradeChange

对象：system-central:N-to-E-semi

原因：短区间坡度变化 12.7 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00386 · P1 · warning · vertical.abruptGradeChange

对象：system-central:S-to-W-semi

原因：短区间坡度变化 16 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00404 · P1 · warning · vertical.elevationPointOscillation

对象：system-central:S-to-W-semi

原因：4 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00405 · P1 · warning · vertical.elevationPointOscillation

对象：system-central:E-to-S-semi

原因：7 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00406 · P1 · warning · vertical.elevationPointOscillation

对象：system-central:N-to-E-semi

原因：3 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00407 · P1 · warning · vertical.elevationPointOscillation

对象：system-central:W-to-N-semi

原因：3 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-02831 · P1 · info · vertical.gradeReversals

对象：system-central:S-to-W-semi

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 74.53 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02832 · P1 · info · vertical.gradeReversals

对象：system-central:E-to-S-semi

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 71.84 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02833 · P1 · info · vertical.gradeReversals

对象：system-central:N-to-E-semi

原因：多次升降需分段核查；坡向反转 9 次，累计高程变化 75.41 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02834 · P1 · info · vertical.gradeReversals

对象：system-central:W-to-N-semi

原因：多次升降需分段核查；坡向反转 9 次，累计高程变化 56.03 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02878 · P1 · info · vertical.rampReversal

对象：system-central:S-to-W-semi

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 74.53 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02879 · P1 · info · vertical.rampReversal

对象：system-central:E-to-S-semi

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 71.84 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02880 · P1 · info · vertical.rampReversal

对象：system-central:N-to-E-semi

原因：多次升降需分段核查；坡向反转 9 次，累计高程变化 75.41 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02881 · P1 · info · vertical.rampReversal

对象：system-central:W-to-N-semi

原因：多次升降需分段核查；坡向反转 9 次，累计高程变化 56.03 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-00050 · P2 · warning · intersection.acuteApproach

对象：urban-junction-48

原因：Arms north and east meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00100 · P2 · warning · intersection.approachKink

对象：urban-junction-48

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00129 · P2 · warning · intersection.shortApproach

对象：urban-junction-28

原因：Approach v91-ns-0-a-5 is only 6 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00154 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-7

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00158 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-22

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00159 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-28

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00164 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-48

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

## Q9 机场方向

P0/P1 review queued

### CM266-00321 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-south:S-to-E-right

原因：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00326 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:N-to-W-right

原因：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00327 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:S-to-E-right

原因：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00355 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-south:E-to-N-right

原因：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00371 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:E-to-N-right

原因：短区间坡度变化 8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00372 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:W-to-S-right

原因：短区间坡度变化 8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00381 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:S-to-W-turbine

原因：短区间坡度变化 15.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00387 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-south:N-to-E-turbine

原因：短区间坡度变化 15.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00388 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:W-to-N-turbine

原因：短区间坡度变化 15.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00389 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:N-to-E-turbine

原因：短区间坡度变化 15.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00391 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-distributor:E-to-S-turbine

原因：短区间坡度变化 15.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00392 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:airport-south:E-to-S-turbine

原因：短区间坡度变化 15.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00393 · P1 · warning · vertical.abruptGradeChange

对象：regional:v8:airport-city-road

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00396 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:airport-south:E-to-S-turbine

原因：7 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00397 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:airport-south:N-to-E-turbine

原因：3 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00398 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:airport-distributor:S-to-W-turbine

原因：4 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00399 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:airport-distributor:E-to-S-turbine

原因：5 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00400 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:airport-distributor:N-to-E-turbine

原因：5 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00401 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:airport-distributor:W-to-N-turbine

原因：4 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-02825 · P1 · info · vertical.gradeReversals

对象：regional:v3:airport-south:E-to-S-turbine

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 70.27 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02826 · P1 · info · vertical.gradeReversals

对象：regional:v3:airport-south:N-to-E-turbine

原因：多次升降需分段核查；坡向反转 4 次，累计高程变化 52.05 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02827 · P1 · info · vertical.gradeReversals

对象：regional:v3:airport-distributor:S-to-W-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 74.00 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02828 · P1 · info · vertical.gradeReversals

对象：regional:v3:airport-distributor:E-to-S-turbine

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 72.21 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02829 · P1 · info · vertical.gradeReversals

对象：regional:v3:airport-distributor:N-to-E-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 75.94 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02830 · P1 · info · vertical.gradeReversals

对象：regional:v3:airport-distributor:W-to-N-turbine

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 72.62 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02867 · P1 · info · vertical.rampReversal

对象：regional:v3:airport-south:E-to-S-turbine

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 70.27 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02868 · P1 · info · vertical.rampReversal

对象：regional:v3:airport-south:N-to-E-turbine

原因：多次升降需分段核查；坡向反转 4 次，累计高程变化 52.05 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02869 · P1 · info · vertical.rampReversal

对象：regional:v3:airport-distributor:S-to-W-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 74.00 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02870 · P1 · info · vertical.rampReversal

对象：regional:v3:airport-distributor:E-to-S-turbine

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 72.21 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02871 · P1 · info · vertical.rampReversal

对象：regional:v3:airport-distributor:N-to-E-turbine

原因：多次升降需分段核查；坡向反转 6 次，累计高程变化 75.94 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02872 · P1 · info · vertical.rampReversal

对象：regional:v3:airport-distributor:W-to-N-turbine

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 72.62 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-00178 · P2 · warning · intersection.stalePortAngle

对象：v8-airport-gateway

原因：Port north bearing differs from the road by 27°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

## Q10 晨江外围

P0/P1 review queued

### CM266-00305 · P1 · warning · topology.lowClearance

对象：regional:v3:S29:out:32；配对：regional:v3:northeast-chenjiang:S-to-W-turbine

原因：中心线高差 5.15 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。

判定：borderline / 临界；误报可能：possible; centerline separation is not underside clearance

建议方法：manual clearance adjustment after structural envelope review（未执行）。

### CM266-00306 · P1 · warning · topology.lowClearance

对象：regional:v3:S29:in:15；配对：regional:v3:northeast-chenjiang:S-to-W-turbine

原因：中心线高差 5.15 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。

判定：borderline / 临界；误报可能：possible; centerline separation is not underside clearance

建议方法：manual clearance adjustment after structural envelope review（未执行）。

### CM266-00353 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:north-river:N-to-E-turbine

原因：短区间坡度变化 7.3 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00394 · P1 · warning · vertical.abruptGradeChange

对象：regional:v3:chenjiang-foldback

原因：短区间坡度变化 10.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00395 · P1 · warning · vertical.elevationPointOscillation

对象：regional:v3:chenjiang-foldback

原因：6 high-frequency elevation control points

判定：suspicious vertical oscillation；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-02824 · P1 · info · vertical.gradeReversals

对象：regional:v3:chenjiang-foldback

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 175.65 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

### CM266-02866 · P1 · info · vertical.rampReversal

对象：regional:v3:chenjiang-foldback

原因：多次升降需分段核查；坡向反转 8 次，累计高程变化 175.65 m。同路另有纵坡折点，不能与本条 reversal 混为一谈。

判定：suspicious vertical oscillation；误报可能：possible

建议方法：repairRamp / repairElevation after crossing constraints review（未执行）。

## Q11 南环门户

P0/P1 review queued

### CM266-00320 · P1 · warning · vertical.abruptGradeChange

对象：system-south:E-to-S-loop

原因：短区间坡度变化 12 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00332 · P1 · warning · vertical.abruptGradeChange

对象：system-south:S-to-W-semi

原因：短区间坡度变化 13.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00334 · P1 · warning · vertical.abruptGradeChange

对象：system-south:S-to-E-right

原因：短区间坡度变化 17.1 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00338 · P1 · warning · vertical.abruptGradeChange

对象：system-south:N-to-E-semi

原因：短区间坡度变化 9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00340 · P1 · warning · vertical.abruptGradeChange

对象：system-south:W-to-N-loop

原因：短区间坡度变化 12.7 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00358 · P1 · warning · vertical.abruptGradeChange

对象：system-south:W-to-S-right

原因：短区间坡度变化 17.1 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00362 · P1 · warning · vertical.abruptGradeChange

对象：system-south:N-to-W-right

原因：短区间坡度变化 10.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00366 · P1 · warning · vertical.abruptGradeChange

对象：system-south:E-to-N-right

原因：短区间坡度变化 10.3 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00025 · P2 · warning · geometry.shortSegments

对象：system-south:S-to-W-semi

原因：7 road segments shorter than 1.5 m

判定：needs review；误报可能：possible

建议方法：repairRamp（未执行）。

### CM266-02761 · P2 · info · topology.deadEnd

对象：v91-ring-south-inner-cd

原因：城市道路开放端，最近同层道路距 75.77 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02762 · P2 · info · topology.deadEnd

对象：v91-ring-south-outer-cd

原因：城市道路开放端，最近同层道路距 112.92 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02764 · P2 · info · topology.deadEnd

对象：v8-ring-south-cross-split

原因：城市道路开放端，最近同层道路距 34.87 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02780 · P2 · info · topology.deadEnd

对象：v91-ring-south-inner-cd-section-section

原因：城市道路开放端，最近同层道路距 53.93 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02781 · P2 · info · topology.deadEnd

对象：v91-ring-south-outer-cd-section-section

原因：城市道路开放端，最近同层道路距 112.94 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q12 西环门户

P0/P1 review queued

### CM266-00318 · P1 · warning · vertical.abruptGradeChange

对象：system-west:E-to-S-loop

原因：短区间坡度变化 11.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00319 · P1 · warning · vertical.abruptGradeChange

对象：system-west:W-to-N-loop

原因：短区间坡度变化 11.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00323 · P1 · warning · vertical.abruptGradeChange

对象：system-west:W-to-S-right

原因：短区间坡度变化 8.5 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00335 · P1 · warning · vertical.abruptGradeChange

对象：system-west:E-to-N-right

原因：短区间坡度变化 11.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00341 · P1 · warning · vertical.abruptGradeChange

对象：system-west:S-to-W-loop

原因：短区间坡度变化 10.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00342 · P1 · warning · vertical.abruptGradeChange

对象：system-west:N-to-E-loop

原因：短区间坡度变化 10.5 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00361 · P1 · warning · vertical.abruptGradeChange

对象：system-west:S-to-E-right

原因：短区间坡度变化 11.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-00375 · P1 · warning · vertical.abruptGradeChange

对象：system-west:N-to-W-right

原因：短区间坡度变化 8.5 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

### CM266-02752 · P2 · info · topology.deadEnd

对象：v91-ring-west-distributor

原因：城市道路开放端，最近同层道路距 111.09 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02776 · P2 · info · topology.deadEnd

对象：v8-ring-west-cross-split

原因：城市道路开放端，最近同层道路距 92.63 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02782 · P2 · info · topology.deadEnd

对象：v91-ring-west-distributor-section-section

原因：城市道路开放端，最近同层道路距 120.93 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q13 西兴

P0/P1 review queued

### CM266-00368 · P1 · warning · vertical.abruptGradeChange

对象：v8-beijing-road-split-split-split-split

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00376 · P1 · warning · vertical.abruptGradeChange

对象：urban-underpass-west-link

原因：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairElevation; preserve junction/deck elevations（未执行）。

### CM266-00035 · P2 · warning · intersection.acuteApproach

对象：urban-junction-75

原因：Arms south and west meet at 28°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00037 · P2 · warning · intersection.acuteApproach

对象：urban-junction-96

原因：Arms north and east meet at 26°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00039 · P2 · warning · intersection.acuteApproach

对象：urban-junction-119

原因：Arms north and east meet at 5°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00040 · P2 · warning · intersection.acuteApproach

对象：urban-junction-128

原因：Arms north and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00041 · P2 · warning · intersection.acuteApproach

对象：urban-junction-148

原因：Arms south and west meet at 30°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00042 · P2 · warning · intersection.acuteApproach

对象：urban-junction-155

原因：Arms north and extra meet at 19°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00045 · P2 · warning · intersection.acuteApproach

对象：urban-junction-204

原因：Arms east and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00046 · P2 · warning · intersection.acuteApproach

对象：urban-junction-205

原因：Arms north and east meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00052 · P2 · warning · intersection.acuteApproach

对象：urban-junction-52

原因：Arms east and west meet at 12°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00053 · P2 · warning · intersection.acuteApproach

对象：urban-junction-71

原因：Arms south and west meet at 25°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00054 · P2 · warning · intersection.acuteApproach

对象：urban-junction-86

原因：Arms north and east meet at 19°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00069 · P2 · warning · intersection.acuteApproach

对象：urban-junction-57

原因：Arms north and west meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00092 · P2 · warning · intersection.approachKink

对象：urban-junction-119

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00093 · P2 · warning · intersection.approachKink

对象：urban-junction-128

原因：Approach west runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00095 · P2 · warning · intersection.approachKink

对象：urban-junction-204

原因：Approach east runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00096 · P2 · warning · intersection.approachKink

对象：urban-junction-205

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00102 · P2 · warning · intersection.approachKink

对象：urban-junction-86

原因：Approach south runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00108 · P2 · warning · intersection.approachKink

对象：urban-junction-57

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00125 · P2 · warning · intersection.shortApproach

对象：urban-junction-76

原因：Approach v4-west-split-2-split-m91 is only 9 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00127 · P2 · warning · intersection.shortApproach

对象：urban-junction-128

原因：Approach v4-north-split-3-split-3-m91 is only 5.5 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00128 · P2 · warning · intersection.shortApproach

对象：urban-junction-165

原因：Approach v5-west-east-road-split-2-split-2-m91 is only 9.5 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00131 · P2 · warning · intersection.shortApproach

对象：urban-junction-98

原因：Approach v4-west-split-2-split-m91 is only 9 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00132 · P2 · warning · intersection.shortApproach

对象：urban-junction-237

原因：Approach v5-west-east-road-split-2-split-2-m91 is only 9.5 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00133 · P2 · warning · intersection.shortApproach

对象：urban-junction-57

原因：Approach v4-north-split-3-split-3-m91 is only 5.5 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00136 · P2 · warning · intersection.shortApproach

对象：v91-local-junction-4

原因：Approach v5-west-lane-m91 is only 4.3 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00143 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-77

原因：Port east bearing differs from the road by 28°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00146 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-128

原因：Port west bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00167 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-52

原因：Port north bearing differs from the road by 41°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00179 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-57

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00198 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-119

原因：Crosswalks on north and east overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00199 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-86

原因：Crosswalks on south and west overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00216 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-75

原因：Stop line on south is 12.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00218 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-96

原因：Stop line on north is 9.2 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00221 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-119

原因：Stop line on south is 12 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00223 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-133

原因：Stop line on north is 8.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00224 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-148

原因：Stop line on south is 8.4 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00225 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-155

原因：Stop line on north is 19.2 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00228 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-52

原因：Stop line on east is 15.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00229 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-71

原因：Stop line on south is 12.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00274 · P2 · warning · topology.deadEnd

对象：v4-central-m91

原因：城市道路开放端，最近同层道路距 17.33 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00317 · P2 · warning · topology.tinyFragment

对象：v5-west-lane-m91

原因：Road fragment is only 4.3 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-02755 · P2 · info · topology.deadEnd

对象：v4-west-residential-m91

原因：城市道路开放端，最近同层道路距 5.75 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02757 · P2 · info · topology.deadEnd

对象：v6-west-warehouse-lane-split-2-split-m91

原因：城市道路开放端，最近同层道路距 86.44 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02758 · P2 · info · topology.deadEnd

对象：v4-west-market-c91

原因：城市道路开放端，最近同层道路距 41.03 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02759 · P2 · info · topology.deadEnd

对象：v4-west-offset-c91

原因：城市道路开放端，最近同层道路距 206.74 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02760 · P2 · info · topology.deadEnd

对象：v6-west-market-street-split-2-split-c91

原因：城市道路开放端，最近同层道路距 38.65 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02773 · P2 · info · topology.deadEnd

对象：v6-west-market-street-c91

原因：城市道路开放端，最近同层道路距 38.65 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-02779 · P2 · info · topology.deadEnd

对象：v4-west-offset-split-c91-section

原因：城市道路开放端，最近同层道路距 104.11 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q14 东部外围 / G17

P0/P1 review queued

### CM266-00349 · P1 · warning · vertical.abruptGradeChange

对象：regional:binhe:on:-1

原因：短区间坡度变化 9.4 个百分点；即使最大坡度不超限，也可能有明显纵向折点。

判定：engineering review required；误报可能：possible; inspect authored vertical transition

建议方法：repairRamp; preserve required over/under crossings（未执行）。

## Q15 望川路南北快速路走廊

no P0/P1 issue found

### CM266-00048 · P2 · warning · intersection.acuteApproach

对象：urban-junction-33

原因：Arms north and east meet at 9°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00049 · P2 · warning · intersection.acuteApproach

对象：urban-junction-46

原因：Arms north and east meet at 0°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00051 · P2 · warning · intersection.acuteApproach

对象：urban-junction-49

原因：Arms north and east meet at 22°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00058 · P2 · warning · intersection.acuteApproach

对象：urban-junction-214

原因：Arms east and south meet at 23°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00059 · P2 · warning · intersection.acuteApproach

对象：urban-junction-215

原因：Arms east and south meet at 28°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00098 · P2 · warning · intersection.approachKink

对象：urban-junction-33

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00099 · P2 · warning · intersection.approachKink

对象：urban-junction-46

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00101 · P2 · warning · intersection.approachKink

对象：urban-junction-49

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00130 · P2 · warning · intersection.shortApproach

对象：urban-junction-33

原因：Approach v91-ns-0-a-5 is only 6 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00160 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-32

原因：Port north bearing differs from the road by 26°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00161 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-33

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00163 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-46

原因：Port north bearing differs from the road by 180°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00165 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-49

原因：Port north bearing differs from the road by 174°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00172 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-209

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00173 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-211

原因：Port east bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00175 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-214

原因：Port east bearing differs from the road by 61°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00176 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-215

原因：Port east bearing differs from the road by 48°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00231 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-211

原因：Stop line on east is 26.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

## Q16 内环大道

no P0/P1 issue found

### CM266-00032 · P2 · warning · intersection.acuteApproach

对象：urban-junction-25

原因：Arms north and west meet at 3°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00056 · P2 · warning · intersection.acuteApproach

对象：urban-junction-181

原因：Arms south and west meet at 3°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00088 · P2 · warning · intersection.approachKink

对象：urban-junction-25

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00140 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-23

原因：Port east bearing differs from the road by 33°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00141 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-25

原因：Port north bearing differs from the road by 70°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00142 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-27

原因：Port west bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00148 · P2 · warning · intersection.stalePortAngle

对象：urban-junction

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00162 · P2 · warning · intersection.stalePortAngle

对象：urban-junction-38

原因：Port south bearing differs from the road by 67°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00200 · P2 · warning · marking.crosswalkOverlap

对象：urban-junction-181

原因：Crosswalks on south and west overlap

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00212 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-24

原因：Stop line on east is 8.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00213 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-29

原因：Stop line on north is 10.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00220 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-107

原因：Stop line on east is 13.2 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00230 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-181

原因：Stop line on south is 11.2 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00247 · P2 · warning · marking.stopLineDisplaced

对象：direction-mingyuan-companion-inner

原因：Stop line on east is 8.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

## Q17 锦城

no P0/P1 issue found

### CM266-00044 · P2 · warning · intersection.acuteApproach

对象：urban-junction-169

原因：Arms north and east meet at 9°

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00094 · P2 · warning · intersection.approachKink

对象：urban-junction-169

原因：Approach north runs along the junction edge; smooth it before rebuilding markings

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00271 · P2 · warning · topology.deadEnd

对象：v6-civic-north-link-v91

原因：城市道路开放端，最近同层道路距 20.04 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00273 · P2 · warning · topology.deadEnd

对象：urban-diagonal-split-split-m91

原因：城市道路开放端，最近同层道路距 65.14 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

### CM266-00282 · P2 · warning · topology.deadEnd

对象：urban-east-ns-split-split-split-split-split-m91

原因：城市道路开放端，最近同层道路距 46.14 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q18 清和

no P0/P1 issue found

### CM266-00124 · P2 · warning · intersection.shortApproach

对象：urban-junction-36

原因：Approach v4-central-split-3-split-2-m91 is only 2.9 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00126 · P2 · warning · intersection.shortApproach

对象：urban-junction-120

原因：Approach v4-central-split-3-split-2-m91 is only 2.9 m long

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00217 · P2 · warning · marking.stopLineDisplaced

对象：urban-junction-89

原因：Stop line on south is 12.8 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00316 · P2 · warning · topology.tinyFragment

对象：v4-central-split-3-split-2-m91

原因：Road fragment is only 2.9 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-02756 · P2 · info · topology.deadEnd

对象：v5-civic-block-road-split-split-m91

原因：城市道路开放端，最近同层道路距 25.81 m；可能有意不贯通，先核查再决定重接。

判定：unconfirmed urban terminus；误报可能：possible

建议方法：manual endpoint and navigation review（未执行）。

## Q19 其他外围干线

no P0/P1 issue found

### CM266-00310 · P2 · warning · topology.tinyFragment

对象：regional:S18:out:3

原因：Road fragment is only 4.2 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-00311 · P2 · warning · topology.tinyFragment

对象：regional:S18:in:11

原因：Road fragment is only 0.8 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-00313 · P2 · warning · topology.tinyFragment

对象：regional:v3:S89-extension2:out:10

原因：Road fragment is only 2.5 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-00314 · P2 · warning · topology.tinyFragment

对象：regional:v3:S31-extension130:in:5

原因：Road fragment is only 0.1 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

### CM266-00315 · P2 · warning · topology.tinyFragment

对象：regional:v3:S36-extension54:in:21:revision411:lane4510

原因：Road fragment is only 5 m long

判定：needs review；误报可能：possible

建议方法：manual topology edit（未执行）。

## Q20 明远快速路

no P0/P1 issue found

### CM266-00248 · P2 · warning · marking.stopLineDisplaced

对象：access-mingyuan-inner-signal

原因：Stop line on north is 13.6 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。

### CM266-00249 · P2 · warning · marking.stopLineDisplaced

对象：access-mingyuan-zhongshan-signal

原因：Stop line on north is 14 m from the mouth because the approach is tangential

判定：junction/marking review required；误报可能：possible, especially shared/divided approaches

建议方法：repairIntersection after confirming tangents and pavement ownership（未执行）。
