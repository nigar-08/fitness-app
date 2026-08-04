package com.fitness.activityservice.service;

import com.fitness.activityservice.ActivityRepository;
import com.fitness.activityservice.model.Activity;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@ConditionalOnProperty(name = "outbox.publisher.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class ActivityEventPublisher {

    private final ActivityRepository activityRepository;
    private final RabbitTemplate rabbitTemplate;

    @Value("${rabbitmq.exchange.name}")
    private String exchange;

    @Value("${rabbitmq.routing.key}")
    private String routingKey;

    @Scheduled(fixedDelayString = "${outbox.publisher.delay-ms:1000}")
    public void publishPendingActivities() {
        activityRepository.findTop100ByEventPublishedFalseOrderByCreatedAtAsc()
                .forEach(this::publish);
    }

    void publish(Activity activity) {
        try {
            rabbitTemplate.convertAndSend(exchange, routingKey, activity);
            activity.setEventPublished(true);
            activity.setEventPublishedAt(LocalDateTime.now());
            activityRepository.save(activity);
            log.info("Published activity event {}", activity.getId());
        } catch (RuntimeException exception) {
            activity.setPublishAttempts(activity.getPublishAttempts() + 1);
            activityRepository.save(activity);
            log.warn("Activity event {} remains pending after publish attempt {}",
                    activity.getId(), activity.getPublishAttempts(), exception);
        }
    }
}
