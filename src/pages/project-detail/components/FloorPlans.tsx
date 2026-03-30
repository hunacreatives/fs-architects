interface FloorPlan {
  label: string;
  image: string;
}

interface FloorPlansProps {
  plans: FloorPlan[];
}

export default function FloorPlans({ plans }: FloorPlansProps) {
  return (
    <section className="px-4 md:px-16 lg:px-24 pb-14 md:pb-20">
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
        {plans.map((plan, i) => (
          <div key={i} className="flex-1 flex flex-col">
            <div className="w-full h-44 sm:h-48 md:h-56 overflow-hidden bg-gray-50 border border-black/8">
              <img
                src={plan.image}
                alt={plan.label}
                className="w-full h-full object-cover object-top"
              />
            </div>
            <p
              className="text-xs text-black/40 mt-2 tracking-wider"
              style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
            >
              {plan.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
